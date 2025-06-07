const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static('public'));

// Database connection
let pool = null;

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes
app.get('/api/status', (req, res) => {
    res.json({
        name: 'School Calendar API',
        version: '1.0.0',
        status: 'running',
        environment: process.env.REPL_SLUG ? 'replit' : 'local',
        database: pool ? 'configured' : 'not configured',
        endpoints: {
            health: '/api/health',
            init: 'POST /api/init',
            daySchedules: '/api/day-schedules',
            dayTypes: '/api/day-types',
            events: '/api/events'
        }
    });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        if (!pool) {
            return res.status(200).json({ 
                status: 'ok',
                database: 'not configured',
                message: 'API server running, database not initialized yet'
            });
        }

        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();

        res.json({ 
            status: 'ok', 
            database: 'connected',
            message: 'Database connected and ready'
        });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({ 
            status: 'error',
            database: 'error',
            error: 'Database connection failed',
            message: error.message
        });
    }
});

// Initialize database
app.post('/api/init', async (req, res) => {
    try {
        const { dbUrl } = req.body;

        if (!dbUrl) {
            return res.status(400).json({ error: 'Database URL is required' });
        }

        console.log('Initializing database connection...');

        // Create new pool with provided URL
        pool = new Pool({
            connectionString: dbUrl,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 10000,
            idleTimeoutMillis: 30000,
            max: 10
        });

        // Test connection
        console.log('Testing database connection...');
        const client = await pool.connect();
        console.log('Database connection successful!');

        // Create tables
        console.log('Creating tables...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS day_schedules (
                date DATE PRIMARY KEY,
                schedule VARCHAR(1) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS day_types (
                date DATE PRIMARY KEY,
                type VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS events (
                id SERIAL PRIMARY KEY,
                school VARCHAR(10) NOT NULL,
                date DATE NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_events_school_date ON events(school, date)
        `);

        console.log('Tables created successfully!');
        client.release();

        res.json({ 
            message: 'Database initialized successfully',
            tables: ['day_schedules', 'day_types', 'events'],
            status: 'success'
        });

    } catch (error) {
        console.error('Database initialization error:', error);

        let errorMessage = error.message;
        if (error.code === 'ENOTFOUND') {
            errorMessage = 'Database host not found. Check your Neon connection string.';
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Connection refused. Check if database is accessible.';
        } else if (error.code === '28P01') {
            errorMessage = 'Invalid username/password. Check your Neon credentials.';
        } else if (error.code === '3D000') {
            errorMessage = 'Database does not exist. Check your database name.';
        }

        res.status(500).json({ 
            error: errorMessage,
            code: error.code,
            details: error.detail,
            status: 'failed'
        });
    }
});

// Day Schedules Routes
app.get('/api/day-schedules', async (req, res) => {
    try {
        if (!pool) {
            return res.status(400).json({ error: 'Database not initialized' });
        }

        const client = await pool.connect();
        const result = await client.query('SELECT * FROM day_schedules ORDER BY date');
        client.release();

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching day schedules:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/day-schedules', async (req, res) => {
    try {
        if (!pool) {
            return res.status(400).json({ error: 'Database not initialized' });
        }

        const { date, schedule } = req.body;
        const client = await pool.connect();

        if (schedule === null || schedule === undefined) {
            await client.query('DELETE FROM day_schedules WHERE date = $1', [date]);
        } else {
            await client.query(`
                INSERT INTO day_schedules (date, schedule, updated_at) 
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (date) 
                DO UPDATE SET schedule = $2, updated_at = CURRENT_TIMESTAMP
            `, [date, schedule]);
        }

        client.release();
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating day schedule:', error);
        res.status(500).json({ error: error.message });
    }
});

// Day Types Routes
app.get('/api/day-types', async (req, res) => {
    try {
        if (!pool) {
            return res.status(400).json({ error: 'Database not initialized' });
        }

        const client = await pool.connect();
        const result = await client.query('SELECT * FROM day_types ORDER BY date');
        client.release();

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching day types:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/day-types', async (req, res) => {
    try {
        if (!pool) {
            return res.status(400).json({ error: 'Database not initialized' });
        }

        const { date, type } = req.body;
        const client = await pool.connect();

        if (type === null || type === undefined) {
            await client.query('DELETE FROM day_types WHERE date = $1', [date]);
        } else {
            await client.query(`
                INSERT INTO day_types (date, type, updated_at) 
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (date) 
                DO UPDATE SET type = $2, updated_at = CURRENT_TIMESTAMP
            `, [date, type]);
        }

        client.release();
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating day type:', error);
        res.status(500).json({ error: error.message });
    }
});

// Events Routes
app.get('/api/events', async (req, res) => {
    try {
        if (!pool) {
            return res.status(400).json({ error: 'Database not initialized' });
        }

        const { school } = req.query;
        const client = await pool.connect();

        const result = await client.query(
            'SELECT * FROM events WHERE school = $1 ORDER BY date, id',
            [school]
        );

        client.release();
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/events', async (req, res) => {
    try {
        if (!pool) {
            return res.status(400).json({ error: 'Database not initialized' });
        }

        const { school, date, title, description } = req.body;
        const client = await pool.connect();

        const result = await client.query(`
            INSERT INTO events (school, date, title, description)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [school, date, title, description || '']);

        client.release();
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/events/:id', async (req, res) => {
    try {
        if (!pool) {
            return res.status(400).json({ error: 'Database not initialized' });
        }

        const { id } = req.params;
        const { title, description } = req.body;
        const client = await pool.connect();

        const result = await client.query(`
            UPDATE events 
            SET title = $1, description = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *
        `, [title, description || '', id]);

        client.release();

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating event:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/events/:id', async (req, res) => {
    try {
        if (!pool) {
            return res.status(400).json({ error: 'Database not initialized' });
        }

        const { id } = req.params;
        const client = await pool.connect();

        const result = await client.query('DELETE FROM events WHERE id = $1 RETURNING *', [id]);
        client.release();

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).json({ error: error.message });
    }
});

// Clear all data
app.delete('/api/clear-all', async (req, res) => {
    try {
        if (!pool) {
            return res.status(400).json({ error: 'Database not initialized' });
        }

        const client = await pool.connect();

        await client.query('DELETE FROM events');
        await client.query('DELETE FROM day_schedules');
        await client.query('DELETE FROM day_types');

        client.release();
        res.json({ success: true, message: 'All data cleared' });
    } catch (error) {
        console.error('Error clearing data:', error);
        res.status(500).json({ error: error.message });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Calendar API server running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.REPL_SLUG ? 'Replit' : 'Local'}`);

    if (process.env.REPL_SLUG) {
        console.log(`🌐 Frontend URL: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
        console.log(`🔧 API Status: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co/api/status`);
    } else {
        console.log(`🌐 Frontend URL: http://localhost:${PORT}`);
        console.log(`🔧 API Status: http://localhost:${PORT}/api/status`);
    }

    console.log(`✅ Server ready to accept connections`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.close(() => {
        if (pool) {
            pool.end();
        }
        process.exit(0);
    });
});
