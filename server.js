const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Replit-specific middleware
app.use(cors({
    origin: true, // Allow all origins in Replit
    credentials: true
}));
app.use(express.json());

// For Replit - serve static files
app.use(express.static('public'));

// Database connection
let pool = null;

// Helper function to format dates consistently
function formatDate(dateInput) {
    if (!dateInput) return null;

    // If it's already a Date object
    if (dateInput instanceof Date) {
        return dateInput.toISOString().split('T')[0];
    }

    // If it's a string, parse it and format
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) {
        throw new Error('Invalid date format');
    }

    return date.toISOString().split('T')[0];
}

// Root route - simple info page
app.get('/', (req, res) => {
    res.json({
        name: 'School Calendar API',
        version: '2.1.0',
        status: 'running',
        endpoints: {
            health: '/api/health',
            init: 'POST /api/init',
            daySchedules: '/api/day-schedules',
            dayTypes: '/api/day-types',
            events: '/api/events',
            materials: '/api/materials'
        },
        message: 'API is running! Use the frontend HTML file to interact with the calendar system.'
    });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ 
                error: 'Database not configured',
                connected: false 
            });
        }

        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();

        res.json({ 
            status: 'ok', 
            message: 'Database connected',
            connected: true,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({ 
            error: 'Database connection failed',
            connected: false,
            details: error.message
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

        console.log('Attempting to connect to database...');
        console.log('Database URL provided:', dbUrl.replace(/:[^:@]+@/, ':****@')); // Hide password in logs

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

        // Day schedules table
        await client.query(`
            CREATE TABLE IF NOT EXISTS day_schedules (
                date DATE PRIMARY KEY,
                schedule VARCHAR(1) NOT NULL CHECK (schedule IN ('A', 'B')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Day types table
        await client.query(`
            CREATE TABLE IF NOT EXISTS day_types (
                date DATE PRIMARY KEY,
                type VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Events table
        await client.query(`
            CREATE TABLE IF NOT EXISTS events (
                id SERIAL PRIMARY KEY,
                school VARCHAR(10) NOT NULL CHECK (school IN ('wlhs', 'wvhs')),
                date DATE NOT NULL,
                title VARCHAR(255) NOT NULL,
                department VARCHAR(50),
                time TIME,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Materials table
        await client.query(`
            CREATE TABLE IF NOT EXISTS materials (
                id SERIAL PRIMARY KEY,
                school VARCHAR(10) NOT NULL CHECK (school IN ('wlhs', 'wvhs')),
                date DATE NOT NULL,
                grade_level INTEGER NOT NULL CHECK (grade_level BETWEEN 9 AND 12),
                title VARCHAR(255) NOT NULL,
                link TEXT NOT NULL,
                description TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for better performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_events_school_date ON events(school, date)
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_materials_school_date_grade ON materials(school, date, grade_level)
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_events_date ON events(date)
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_materials_date ON materials(date)
        `);

        console.log('Tables created successfully!');
        client.release();

        res.json({ 
            message: 'Database initialized successfully',
            tables: ['day_schedules', 'day_types', 'events', 'materials'],
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Database initialization error:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            detail: error.detail
        });

        // Provide more specific error messages
        let errorMessage = error.message;
        if (error.code === 'ENOTFOUND') {
            errorMessage = 'Database host not found. Check your connection string.';
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Connection refused. Check if database is running.';
        } else if (error.code === '28P01') {
            errorMessage = 'Invalid username/password. Check your credentials.';
        } else if (error.code === '3D000') {
            errorMessage = 'Database does not exist. Check your database name.';
        }

        res.status(500).json({ 
            error: errorMessage,
            code: error.code,
            details: error.detail
        });
    }
});

// Day Schedules Routes
app.get('/api/day-schedules', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const client = await pool.connect();
        const result = await client.query('SELECT date, schedule FROM day_schedules ORDER BY date');
        client.release();

        // Format dates consistently
        const schedules = result.rows.map(row => ({
            date: formatDate(row.date),
            schedule: row.schedule
        }));

        res.json(schedules);
    } catch (error) {
        console.error('Error fetching day schedules:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/day-schedules', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const { date, schedule } = req.body;

        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        const formattedDate = formatDate(date);
        const client = await pool.connect();

        if (!schedule || schedule === null || schedule === undefined) {
            // Delete the schedule
            await client.query('DELETE FROM day_schedules WHERE date = $1', [formattedDate]);
            console.log('Deleted schedule for:', formattedDate);
        } else {
            // Validate schedule value
            if (!['A', 'B'].includes(schedule)) {
                client.release();
                return res.status(400).json({ error: 'Schedule must be A or B' });
            }

            // Insert or update
            await client.query(`
                INSERT INTO day_schedules (date, schedule, updated_at) 
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (date) 
                DO UPDATE SET schedule = $2, updated_at = CURRENT_TIMESTAMP
            `, [formattedDate, schedule]);
            console.log('Updated schedule for:', formattedDate, 'to:', schedule);
        }

        client.release();
        res.json({ 
            success: true, 
            date: formattedDate, 
            schedule: schedule 
        });
    } catch (error) {
        console.error('Error updating day schedule:', error);
        res.status(500).json({ error: error.message });
    }
});

// Day Types Routes
app.get('/api/day-types', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const client = await pool.connect();
        const result = await client.query('SELECT date, type FROM day_types ORDER BY date');
        client.release();

        // Format dates consistently
        const types = result.rows.map(row => ({
            date: formatDate(row.date),
            type: row.type
        }));

        res.json(types);
    } catch (error) {
        console.error('Error fetching day types:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/day-types', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const { date, type } = req.body;

        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        const formattedDate = formatDate(date);
        const client = await pool.connect();

        if (!type || type === null || type === undefined) {
            // Delete the type
            await client.query('DELETE FROM day_types WHERE date = $1', [formattedDate]);
            console.log('Deleted day type for:', formattedDate);
        } else {
            // Insert or update
            await client.query(`
                INSERT INTO day_types (date, type, updated_at) 
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (date) 
                DO UPDATE SET type = $2, updated_at = CURRENT_TIMESTAMP
            `, [formattedDate, type]);
            console.log('Updated day type for:', formattedDate, 'to:', type);
        }

        client.release();
        res.json({ 
            success: true, 
            date: formattedDate, 
            type: type 
        });
    } catch (error) {
        console.error('Error updating day type:', error);
        res.status(500).json({ error: error.message });
    }
});

// Events Routes
app.get('/api/events', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const { school } = req.query;

        if (!school) {
            return res.status(400).json({ error: 'School parameter is required' });
        }

        if (!['wlhs', 'wvhs'].includes(school)) {
            return res.status(400).json({ error: 'School must be wlhs or wvhs' });
        }

        const client = await pool.connect();
        const result = await client.query(
            'SELECT id, school, date, title, department, time, description, created_at, updated_at FROM events WHERE school = $1 ORDER BY date, time, id',
            [school]
        );
        client.release();

        // Format dates consistently
        const events = result.rows.map(row => ({
            ...row,
            date: formatDate(row.date)
        }));

        console.log(`Fetched ${events.length} events for ${school}`);
        res.json(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/events', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const { school, date, title, department, time, description } = req.body;

        // Validate required fields
        if (!school || !date || !title) {
            return res.status(400).json({ error: 'School, date, and title are required' });
        }

        if (!['wlhs', 'wvhs'].includes(school)) {
            return res.status(400).json({ error: 'School must be wlhs or wvhs' });
        }

        const formattedDate = formatDate(date);
        const client = await pool.connect();

        const result = await client.query(`
            INSERT INTO events (school, date, title, department, time, description)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, school, date, title, department, time, description, created_at, updated_at
        `, [school, formattedDate, title, department || null, time || null, description || '']);

        client.release();

        const event = {
            ...result.rows[0],
            date: formatDate(result.rows[0].date)
        };

        console.log('Created event:', event.id, 'for', school, 'on', formattedDate);
        res.json(event);
    } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/events/:id', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const { id } = req.params;
        const { title, department, time, description } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const client = await pool.connect();

        const result = await client.query(`
            UPDATE events 
            SET title = $1, department = $2, time = $3, description = $4, updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
            RETURNING id, school, date, title, department, time, description, created_at, updated_at
        `, [title, department || null, time || null, description || '', id]);

        client.release();

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const event = {
            ...result.rows[0],
            date: formatDate(result.rows[0].date)
        };

        console.log('Updated event:', id);
        res.json(event);
    } catch (error) {
        console.error('Error updating event:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/events/:id', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const { id } = req.params;
        const client = await pool.connect();

        const result = await client.query('DELETE FROM events WHERE id = $1 RETURNING id', [id]);
        client.release();

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        console.log('Deleted event:', id);
        res.json({ success: true, id: parseInt(id) });
    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).json({ error: error.message });
    }
});

// Materials Routes
app.get('/api/materials', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const { school } = req.query;

        if (!school) {
            return res.status(400).json({ error: 'School parameter is required' });
        }

        if (!['wlhs', 'wvhs'].includes(school)) {
            return res.status(400).json({ error: 'School must be wlhs or wvhs' });
        }

        console.log('Fetching materials for school:', school);
        const client = await pool.connect();

        const result = await client.query(
            'SELECT id, school, date, grade_level, title, link, description, created_at, updated_at FROM materials WHERE school = $1 ORDER BY date, grade_level, id',
            [school]
        );

        client.release();
        console.log(`Found ${result.rows.length} materials for ${school}`);

        // Format dates consistently and ensure we return an array
        const materials = result.rows.map(row => ({
            ...row,
            date: formatDate(row.date)
        }));

        console.log(`Returning ${materials.length} materials for ${school}`);
        res.json(materials);
    } catch (error) {
        console.error('Error fetching materials:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/materials', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const { school, date, grade_level, title, link, description } = req.body;

        // Validate required fields
        if (!school || !date || !grade_level || !title || !link) {
            return res.status(400).json({ error: 'School, date, grade_level, title, and link are required' });
        }

        if (!['wlhs', 'wvhs'].includes(school)) {
            return res.status(400).json({ error: 'School must be wlhs or wvhs' });
        }

        if (![9, 10, 11, 12].includes(parseInt(grade_level))) {
            return res.status(400).json({ error: 'Grade level must be 9, 10, 11, or 12' });
        }

        const formattedDate = formatDate(date);
        const client = await pool.connect();

        const result = await client.query(`
            INSERT INTO materials (school, date, grade_level, title, link, description)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, school, date, grade_level, title, link, description, created_at, updated_at
        `, [school, formattedDate, parseInt(grade_level), title, link, description || '']);

        client.release();

        const material = {
            ...result.rows[0],
            date: formatDate(result.rows[0].date)
        };

        console.log('Created material:', material.id, 'for', school, 'grade', grade_level, 'on', formattedDate);
        res.json(material);
    } catch (error) {
        console.error('Error creating material:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/materials/:id', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const { id } = req.params;
        const { title, link, description } = req.body;

        if (!title || !link) {
            return res.status(400).json({ error: 'Title and link are required' });
        }

        const client = await pool.connect();

        const result = await client.query(`
            UPDATE materials 
            SET title = $1, link = $2, description = $3, updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
            RETURNING id, school, date, grade_level, title, link, description, created_at, updated_at
        `, [title, link, description || '', id]);

        client.release();

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Material not found' });
        }

        const material = {
            ...result.rows[0],
            date: formatDate(result.rows[0].date)
        };

        console.log('Updated material:', id);
        res.json(material);
    } catch (error) {
        console.error('Error updating material:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/materials/:id', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const { id } = req.params;
        const client = await pool.connect();

        const result = await client.query('DELETE FROM materials WHERE id = $1 RETURNING id', [id]);
        client.release();

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Material not found' });
        }

        console.log('Deleted material:', id);
        res.json({ success: true, id: parseInt(id) });
    } catch (error) {
        console.error('Error deleting material:', error);
        res.status(500).json({ error: error.message });
    }
});

// Clear all data (admin function)
app.delete('/api/clear-all', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const client = await pool.connect();

        await client.query('DELETE FROM materials');
        await client.query('DELETE FROM events');
        await client.query('DELETE FROM day_schedules');
        await client.query('DELETE FROM day_types');

        client.release();

        console.log('All data cleared from database');
        res.json({ success: true, message: 'All data cleared' });
    } catch (error) {
        console.error('Error clearing data:', error);
        res.status(500).json({ error: error.message });
    }
});

// Fix materials table structure
app.post('/api/fix-materials-table', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const client = await pool.connect();

        // Drop the existing materials table
        await client.query('DROP TABLE IF EXISTS materials');
        console.log('Dropped existing materials table');

        // Recreate it with correct structure
        await client.query(`
            CREATE TABLE materials (
                id SERIAL PRIMARY KEY,
                school VARCHAR(10) NOT NULL CHECK (school IN ('wlhs', 'wvhs')),
                date DATE NOT NULL,
                grade_level INTEGER NOT NULL CHECK (grade_level BETWEEN 9 AND 12),
                title VARCHAR(255) NOT NULL,
                link TEXT NOT NULL,
                description TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Recreated materials table with correct structure');

        // Create index
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_materials_school_date_grade ON materials(school, date, grade_level)
        `);

        client.release();

        console.log('Materials table fixed successfully');
        res.json({ success: true, message: 'Materials table structure fixed' });
    } catch (error) {
        console.error('Error fixing materials table:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Calendar API server running on port ${PORT}`);
    console.log(`Health check: ${process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co/api/health` : `http://localhost:${PORT}/api/health`}`);
    console.log(`Frontend URL: ${process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : `http://localhost:${PORT}`}`);
});