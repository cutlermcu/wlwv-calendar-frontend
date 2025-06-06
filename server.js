// server.js - Multi-School Calendar System with Enhanced Admin Features
const express = require("express");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads (in memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

// Enhanced logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  if (req.path.startsWith("/api/")) {
    console.log("📡 API Request:", req.method, req.path, req.query);
  }
  next();
});

// Middleware
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (
        origin.includes("replit.dev") ||
        origin.includes("repl.co") ||
        origin.includes("localhost") ||
        origin.includes("127.0.0.1")
      ) {
        return callback(null, true);
      }
      callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Session"],
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

// Validate environment variables
if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set!");
  console.error("For Replit: Add DATABASE_URL to your Secrets (not .env file)");
  console.error(
    "For Local: Check your .env file and make sure DATABASE_URL is configured.",
  );
  process.exit(1);
}

console.log(
  "Database URL configured:",
  process.env.DATABASE_URL.substring(0, 30) + "...",
);
console.log(
  "Environment: Replit detected -",
  !!process.env.REPL_ID ? "Yes" : "No",
);

// Neon PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { require: true },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("connect", () => {
  console.log("✅ Connected to Neon PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected error on idle client:", err);
});

// Initialize database tables
async function initializeDatabase() {
  let client;
  try {
    console.log("🔄 Initializing multi-school database...");
    client = await pool.connect();
    console.log("✅ Database connection established");

    await client.query("SELECT 1");
    console.log("✅ Database query test successful");

    await createTables(client);
    console.log("✅ Database tables created/verified");

    await seedSampleData(client);
    console.log("✅ Sample data seeded");

    console.log("🎉 Multi-school database initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing database:", error);
    console.error("Full error details:", error.message);
    if (error.code) console.error("Error code:", error.code);
    if (error.detail) console.error("Error detail:", error.detail);
    throw error;
  } finally {
    if (client) client.release();
  }
}

async function createTables(client) {
  try {
    console.log("🔄 Creating multi-school database tables...");

    // Events tables for each school
    for (const school of ["wlhs", "wvhs"]) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS events_${school} (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          date DATE NOT NULL,
          time VARCHAR(20),
          department VARCHAR(50) NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS life_curriculum_${school} (
          id SERIAL PRIMARY KEY,
          event_id INTEGER REFERENCES events_${school}(id) ON DELETE CASCADE,
          grade INTEGER NOT NULL CHECK (grade >= 9 AND grade <= 12),
          links TEXT,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS day_labels_${school} (
          id SERIAL PRIMARY KEY,
          date DATE UNIQUE NOT NULL,
          label VARCHAR(10) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS special_days_${school} (
          id SERIAL PRIMARY KEY,
          date DATE UNIQUE NOT NULL,
          type VARCHAR(50) NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log(`✅ Tables for ${school.toUpperCase()} created/verified`);
    }

    // Enhanced school settings table with more style options
    await client.query(`
      CREATE TABLE IF NOT EXISTS school_settings (
        id SERIAL PRIMARY KEY,
        school VARCHAR(10) NOT NULL UNIQUE,
        settings JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Enhanced school banners table with style options
    await client.query(`
      CREATE TABLE IF NOT EXISTS school_banners (
        id SERIAL PRIMARY KEY,
        school VARCHAR(10) NOT NULL UNIQUE,
        message TEXT,
        is_active BOOLEAN DEFAULT true,
        text_size VARCHAR(10) DEFAULT '16px',
        text_color VARCHAR(7) DEFAULT '#ffffff',
        background_color VARCHAR(7) DEFAULT '#ff6b6b',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Enhanced custom links table with style options
    await client.query(`
      CREATE TABLE IF NOT EXISTS custom_links (
        id SERIAL PRIMARY KEY,
        school VARCHAR(10) NOT NULL,
        position VARCHAR(10) NOT NULL CHECK (position IN ('left', 'right')),
        title VARCHAR(100) NOT NULL,
        url TEXT NOT NULL,
        order_index INTEGER DEFAULT 0,
        text_size VARCHAR(10) DEFAULT '12px',
        text_color VARCHAR(7) DEFAULT '#ffffff',
        background_color VARCHAR(7) DEFAULT '#667eea',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Home page buttons table
    await client.query(`
      CREATE TABLE IF NOT EXISTS home_buttons (
        id SERIAL PRIMARY KEY,
        school VARCHAR(10) NOT NULL UNIQUE,
        title VARCHAR(100) NOT NULL,
        image_data TEXT,
        image_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Admin sessions table (simple session management)
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      )
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_events_wlhs_date ON events_wlhs(date);
      CREATE INDEX IF NOT EXISTS idx_events_wvhs_date ON events_wvhs(date);
      CREATE INDEX IF NOT EXISTS idx_events_wlhs_department ON events_wlhs(department);
      CREATE INDEX IF NOT EXISTS idx_events_wvhs_department ON events_wvhs(department);
      CREATE INDEX IF NOT EXISTS idx_day_labels_wlhs_date ON day_labels_wlhs(date);
      CREATE INDEX IF NOT EXISTS idx_day_labels_wvhs_date ON day_labels_wvhs(date);
      CREATE INDEX IF NOT EXISTS idx_special_days_wlhs_date ON special_days_wlhs(date);
      CREATE INDEX IF NOT EXISTS idx_special_days_wvhs_date ON special_days_wvhs(date);
      CREATE INDEX IF NOT EXISTS idx_custom_links_school ON custom_links(school);
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
    `);

    console.log("✅ All database indexes created/verified");
  } catch (error) {
    console.error("❌ Error creating tables:", error);
    throw error;
  }
}

async function seedSampleData(client) {
  try {
    // Check if we already have sample data
    const eventCount = await client.query("SELECT COUNT(*) FROM events_wlhs");
    if (parseInt(eventCount.rows[0].count) > 0) {
      console.log("Sample data already exists");
      return;
    }

    console.log("🌱 Seeding sample data for both schools...");

    // Sample events for both schools
    const sampleEvents = [
      {
        title: "Basketball Game vs. Riverside",
        date: "2025-06-15",
        time: "7:00 PM",
        department: "athletics",
        description: "Home game against Riverside High School",
      },
      {
        title: "SAT Testing",
        date: "2025-06-07",
        time: "8:00 AM",
        department: "testing",
        description: "Standardized SAT testing for juniors and seniors",
      },
      {
        title: "Spring Concert",
        date: "2025-06-20",
        time: "7:30 PM",
        department: "arts",
        description: "Annual spring music concert featuring all grade levels",
      },
    ];

    for (const school of ["wlhs", "wvhs"]) {
      for (const event of sampleEvents) {
        const result = await client.query(
          `INSERT INTO events_${school} (title, date, time, department, description) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [
            event.title,
            event.date,
            event.time,
            event.department,
            event.description,
          ],
        );

        const eventId = result.rows[0].id;

        // Add life curriculum data
        const curriculumData = [
          {
            grade: 9,
            links: `https://example.com/${school}/grade9-${event.department}`,
            description: `Grade 9 ${event.department} curriculum`,
          },
          {
            grade: 10,
            links: `https://example.com/${school}/grade10-${event.department}`,
            description: `Grade 10 ${event.department} curriculum`,
          },
          {
            grade: 11,
            links: `https://example.com/${school}/grade11-${event.department}`,
            description: `Grade 11 ${event.department} curriculum`,
          },
          {
            grade: 12,
            links: `https://example.com/${school}/grade12-${event.department}`,
            description: `Grade 12 ${event.department} curriculum`,
          },
        ];

        for (const curriculum of curriculumData) {
          await client.query(
            `INSERT INTO life_curriculum_${school} (event_id, grade, links, description) VALUES ($1, $2, $3, $4)`,
            [
              eventId,
              curriculum.grade,
              curriculum.links,
              curriculum.description,
            ],
          );
        }
      }

      // Sample day labels
      const dayLabels = [
        { date: "2025-06-01", label: "A" },
        { date: "2025-06-02", label: "B" },
        { date: "2025-06-03", label: "A" },
        { date: "2025-06-04", label: "B" },
        { date: "2025-06-05", label: "A" },
        { date: "2025-06-06", label: "-" },
        { date: "2025-06-07", label: "-" },
        { date: "2025-06-08", label: "B" },
        { date: "2025-06-09", label: "A" },
        { date: "2025-06-10", label: "B" },
      ];

      for (const dayLabel of dayLabels) {
        await client.query(
          `INSERT INTO day_labels_${school} (date, label) VALUES ($1, $2)`,
          [dayLabel.date, dayLabel.label],
        );
      }

      // Sample special days (only the 6 allowed types)
      const specialDays = [
        {
          date: "2025-06-16",
          type: "finals",
          description: "Final exams week begins",
        },
        {
          date: "2025-06-17",
          type: "grading-day",
          description: "Grading day - no students",
        },
        {
          date: "2025-06-30",
          type: "holiday",
          description: "Summer break begins",
        },
        {
          date: "2025-06-13",
          type: "early-release",
          description: "Early dismissal at 1:00 PM",
        },
        { date: "2025-06-25", type: "access", description: "ACCESS day" },
        {
          date: "2025-06-27",
          type: "staff-development",
          description: "Staff development day",
        },
      ];

      for (const specialDay of specialDays) {
        await client.query(
          `INSERT INTO special_days_${school} (date, type, description) VALUES ($1, $2, $3)`,
          [specialDay.date, specialDay.type, specialDay.description],
        );
      }

      // Enhanced default school settings
      const defaultSettings = {
        styles: {
          title: {
            fontSize: "24px",
            color: "#333",
            fontFamily: "Segoe UI",
            textAlign: "center",
          },
          dates: { fontSize: "16px", color: "#333", fontFamily: "Segoe UI" },
          events: { fontSize: "11px", color: "white", fontFamily: "Segoe UI" },
          gridLines: { color: "#f8f9fa" },
          departmentButtons: { fontSize: "12px", fontFamily: "Segoe UI" },
        },
      };

      await client.query(
        "INSERT INTO school_settings (school, settings) VALUES ($1, $2) ON CONFLICT (school) DO NOTHING",
        [school, JSON.stringify(defaultSettings)],
      );

      // Default home button
      await client.query(
        "INSERT INTO home_buttons (school, title) VALUES ($1, $2) ON CONFLICT (school) DO NOTHING",
        [
          school,
          school === "wlhs"
            ? "West Linn High School"
            : "West Valley High School",
        ],
      );

      console.log(`✅ Sample data seeded for ${school.toUpperCase()}`);
    }
  } catch (error) {
    console.error("❌ Error seeding sample data:", error);
    throw error;
  }
}

// Utility function to validate school parameter
function validateSchool(school) {
  return school === "wlhs" || school === "wvhs";
}

// Admin authentication middleware
function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Middleware to check admin authentication
async function requireAdmin(req, res, next) {
  try {
    const sessionId =
      req.headers["x-admin-session"] || req.headers["X-Admin-Session"];

    console.log("🔐 Admin auth check:", {
      sessionId: sessionId ? sessionId.substring(0, 10) + "..." : "missing",
      path: req.path,
      method: req.method,
    });

    if (!sessionId) {
      console.log("❌ No session ID provided");
      return res.status(401).json({ error: "Admin session required" });
    }

    const result = await pool.query(
      "SELECT * FROM admin_sessions WHERE session_id = $1 AND expires_at > NOW()",
      [sessionId],
    );

    if (result.rows.length === 0) {
      console.log("❌ Invalid or expired session");
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    console.log("✅ Admin auth successful");
    next();
  } catch (error) {
    console.error("❌ Admin auth error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
}

// API Routes

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    console.log("🔍 Health check requested");
    const client = await pool.connect();
    const result = await client.query(
      "SELECT NOW() as current_time, version() as pg_version",
    );
    client.release();

    console.log("✅ Health check successful");
    res.json({
      status: "healthy",
      database: "connected",
      timestamp: result.rows[0].current_time,
      postgres_version: result.rows[0].pg_version,
      node_env: process.env.NODE_ENV || "development",
    });
  } catch (error) {
    console.error("❌ Health check failed:", error);
    res.status(500).json({
      status: "unhealthy",
      database: "disconnected",
      error: error.message,
      code: error.code || "UNKNOWN",
    });
  }
});

// Test endpoint
app.get("/api/test", (req, res) => {
  console.log("📋 Test endpoint called");
  res.json({
    message: "Multi-School Calendar Server is running!",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    version: "4.0 - Enhanced Multi-School System with Advanced Admin Features",
  });
});

// Admin authentication endpoints
app.post("/api/admin/login", async (req, res) => {
  try {
    const { password } = req.body;

    if (password !== "Lions") {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Clean up expired sessions
    await pool.query("DELETE FROM admin_sessions WHERE expires_at < NOW()");

    // Create new session
    const sessionId = generateSessionId();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

    await pool.query(
      "INSERT INTO admin_sessions (session_id, expires_at) VALUES ($1, $2)",
      [sessionId, expiresAt],
    );

    console.log("✅ Admin login successful");
    res.json({
      success: true,
      sessionId,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("❌ Admin login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/admin/logout", async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (sessionId) {
      await pool.query("DELETE FROM admin_sessions WHERE session_id = $1", [
        sessionId,
      ]);
      console.log("✅ Admin logout successful");
    }

    res.json({ success: true });
  } catch (error) {
    console.error("❌ Admin logout error:", error);
    res.status(500).json({ error: "Logout failed" });
  }
});

app.post("/api/admin/verify", async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(401).json({ valid: false });
    }

    const result = await pool.query(
      "SELECT * FROM admin_sessions WHERE session_id = $1 AND expires_at > NOW()",
      [sessionId],
    );

    const valid = result.rows.length > 0;
    res.json({ valid });
  } catch (error) {
    console.error("❌ Admin verify error:", error);
    res.status(500).json({ valid: false });
  }
});

// Home page button endpoints
app.get("/api/home/buttons", async (req, res) => {
  try {
    console.log("🏠 Fetching home page buttons");
    const result = await pool.query(
      "SELECT * FROM home_buttons ORDER BY school",
    );
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching home buttons:", error);
    res.status(500).json({ error: "Failed to fetch home buttons" });
  }
});

app.get("/api/home/buttons/:school", async (req, res) => {
  try {
    const { school } = req.params;
    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    const result = await pool.query(
      "SELECT * FROM home_buttons WHERE school = $1",
      [school],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Button not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error fetching home button:", error);
    res.status(500).json({ error: "Failed to fetch home button" });
  }
});

app.put(
  "/api/home/buttons/:school",
  requireAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const { school } = req.params;
      const { title } = req.body;

      if (!validateSchool(school)) {
        return res.status(400).json({ error: "Invalid school" });
      }

      let updateData = { title };

      if (req.file) {
        updateData.image_data = req.file.buffer.toString("base64");
        updateData.image_type = req.file.mimetype;
      }

      const setClause = Object.keys(updateData)
        .map((key, index) => `${key} = $${index + 2}`)
        .join(", ");
      const values = [school, ...Object.values(updateData)];

      const result = await pool.query(
        `UPDATE home_buttons SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE school = $1 RETURNING *`,
        values,
      );

      if (result.rows.length === 0) {
        // Insert if doesn't exist
        const insertResult = await pool.query(
          "INSERT INTO home_buttons (school, title, image_data, image_type) VALUES ($1, $2, $3, $4) RETURNING *",
          [
            school,
            title,
            updateData.image_data || null,
            updateData.image_type || null,
          ],
        );
        res.json(insertResult.rows[0]);
      } else {
        res.json(result.rows[0]);
      }
    } catch (error) {
      console.error("❌ Error updating home button:", error);
      res.status(500).json({ error: "Failed to update home button" });
    }
  },
);

// School-specific events endpoints
app.get("/api/:school/events", async (req, res) => {
  try {
    const { school } = req.params;
    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    console.log(`📅 Fetching events for ${school.toUpperCase()}`);
    const { department } = req.query;

    let query = `
      SELECT e.*, 
             COALESCE(
               json_agg(
                 json_build_object(
                   'grade', lc.grade,
                   'links', lc.links,
                   'description', lc.description
                 )
               ) FILTER (WHERE lc.id IS NOT NULL), 
               '[]'::json
             ) as life_curriculum
      FROM events_${school} e
      LEFT JOIN life_curriculum_${school} lc ON e.id = lc.event_id
    `;

    const params = [];
    if (department && department !== "master") {
      query += ` WHERE e.department = $1`;
      params.push(department);
    }

    query += ` GROUP BY e.id ORDER BY e.date, e.time`;

    const result = await pool.query(query, params);
    console.log(
      `✅ Found ${result.rows.length} events for ${school.toUpperCase()}`,
    );

    res.json(result.rows);
  } catch (error) {
    console.error(`❌ Error fetching events for ${req.params.school}:`, error);
    res.status(500).json({
      error: "Failed to fetch events",
      details: error.message,
    });
  }
});

app.post("/api/:school/events", requireAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const { school } = req.params;
    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    await client.query("BEGIN");

    const { title, date, time, department, description, lifeCurriculum } =
      req.body;

    // Insert event
    const eventResult = await client.query(
      `INSERT INTO events_${school} (title, date, time, department, description) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, date, time || null, department, description],
    );

    const eventId = eventResult.rows[0].id;

    // Insert life curriculum if provided
    if (lifeCurriculum) {
      for (const [grade, curriculum] of Object.entries(lifeCurriculum)) {
        if (curriculum.links || curriculum.description) {
          await client.query(
            `INSERT INTO life_curriculum_${school} (event_id, grade, links, description) VALUES ($1, $2, $3, $4)`,
            [
              eventId,
              parseInt(grade),
              curriculum.links || null,
              curriculum.description || null,
            ],
          );
        }
      }
    }

    await client.query("COMMIT");

    // Fetch the complete event with life curriculum
    const completeEvent = await client.query(
      `
      SELECT e.*, 
             COALESCE(
               json_agg(
                 json_build_object(
                   'grade', lc.grade,
                   'links', lc.links,
                   'description', lc.description
                 )
               ) FILTER (WHERE lc.id IS NOT NULL), 
               '[]'::json
             ) as life_curriculum
      FROM events_${school} e
      LEFT JOIN life_curriculum_${school} lc ON e.id = lc.event_id
      WHERE e.id = $1
      GROUP BY e.id
    `,
      [eventId],
    );

    res.status(201).json(completeEvent.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`❌ Error creating event for ${req.params.school}:`, error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

app.put("/api/:school/events/:id", requireAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const { school, id } = req.params;
    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    await client.query("BEGIN");

    const { title, date, time, department, description, lifeCurriculum } =
      req.body;

    // Update event
    const eventResult = await client.query(
      `UPDATE events_${school} SET title = $1, date = $2, time = $3, department = $4, description = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING *`,
      [title, date, time || null, department, description, id],
    );

    if (eventResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Event not found" });
    }

    // Delete existing life curriculum
    await client.query(
      `DELETE FROM life_curriculum_${school} WHERE event_id = $1`,
      [id],
    );

    // Insert new life curriculum
    if (lifeCurriculum) {
      for (const [grade, curriculum] of Object.entries(lifeCurriculum)) {
        if (curriculum.links || curriculum.description) {
          await client.query(
            `INSERT INTO life_curriculum_${school} (event_id, grade, links, description) VALUES ($1, $2, $3, $4)`,
            [
              id,
              parseInt(grade),
              curriculum.links || null,
              curriculum.description || null,
            ],
          );
        }
      }
    }

    await client.query("COMMIT");

    // Fetch the complete updated event
    const completeEvent = await client.query(
      `
      SELECT e.*, 
             COALESCE(
               json_agg(
                 json_build_object(
                   'grade', lc.grade,
                   'links', lc.links,
                   'description', lc.description
                 )
               ) FILTER (WHERE lc.id IS NOT NULL), 
               '[]'::json
             ) as life_curriculum
      FROM events_${school} e
      LEFT JOIN life_curriculum_${school} lc ON e.id = lc.event_id
      WHERE e.id = $1
      GROUP BY e.id
    `,
      [id],
    );

    res.json(completeEvent.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`❌ Error updating event for ${req.params.school}:`, error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

app.delete("/api/:school/events/:id", requireAdmin, async (req, res) => {
  try {
    const { school, id } = req.params;
    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    const result = await pool.query(
      `DELETE FROM events_${school} WHERE id = $1 RETURNING *`,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error(`❌ Error deleting event for ${req.params.school}:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Day labels endpoints
app.get("/api/:school/day-labels", async (req, res) => {
  try {
    const { school } = req.params;
    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    console.log(`🏷️ Fetching day labels for ${school.toUpperCase()}`);
    const result = await pool.query(
      `SELECT * FROM day_labels_${school} ORDER BY date`,
    );
    console.log(
      `✅ Found ${result.rows.length} day labels for ${school.toUpperCase()}`,
    );

    res.json(result.rows);
  } catch (error) {
    console.error(
      `❌ Error fetching day labels for ${req.params.school}:`,
      error,
    );
    res.status(500).json({
      error: "Failed to fetch day labels",
      details: error.message,
    });
  }
});

app.put("/api/:school/day-labels/:date", requireAdmin, async (req, res) => {
  try {
    const { school, date } = req.params;
    const { label } = req.body;

    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    console.log(
      `🏷️ Updating day label for ${school.toUpperCase()}:`,
      date,
      "to",
      label,
    );

    const result = await pool.query(
      `INSERT INTO day_labels_${school} (date, label) VALUES ($1, $2) 
       ON CONFLICT (date) DO UPDATE SET label = EXCLUDED.label, updated_at = CURRENT_TIMESTAMP 
       RETURNING *`,
      [date, label],
    );

    console.log("✅ Day label updated:", result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error(
      `❌ Error updating day label for ${req.params.school}:`,
      error,
    );
    res.status(500).json({
      error: "Failed to update day label",
      details: error.message,
    });
  }
});

app.delete("/api/:school/day-labels/:date", requireAdmin, async (req, res) => {
  try {
    const { school, date } = req.params;

    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    console.log(`🏷️ Deleting day label for ${school.toUpperCase()}:`, date);

    const result = await pool.query(
      `DELETE FROM day_labels_${school} WHERE date = $1 RETURNING *`,
      [date],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Day label not found" });
    }

    console.log("✅ Day label deleted:", result.rows[0]);
    res.json({ message: "Day label deleted successfully" });
  } catch (error) {
    console.error(
      `❌ Error deleting day label for ${req.params.school}:`,
      error,
    );
    res.status(500).json({
      error: "Failed to delete day label",
      details: error.message,
    });
  }
});

// Special days endpoints
app.get("/api/:school/special-days", async (req, res) => {
  try {
    const { school } = req.params;
    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    console.log(`🌟 Fetching special days for ${school.toUpperCase()}`);
    const result = await pool.query(
      `SELECT * FROM special_days_${school} ORDER BY date`,
    );
    console.log(
      `✅ Found ${result.rows.length} special days for ${school.toUpperCase()}`,
    );

    res.json(result.rows);
  } catch (error) {
    console.error(
      `❌ Error fetching special days for ${req.params.school}:`,
      error,
    );
    res.status(500).json({
      error: "Failed to fetch special days",
      details: error.message,
    });
  }
});

app.put("/api/:school/special-days/:date", requireAdmin, async (req, res) => {
  try {
    const { school, date } = req.params;
    const { type, description } = req.body;

    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    // Validate special day type - only allow the 6 specific types
    const allowedTypes = [
      "finals",
      "grading-day", 
      "access",
      "early-release",
      "holiday",
      "staff-development"
    ];

    console.log(
      `🌟 Updating special day for ${school.toUpperCase()}:`,
      date,
      "to",
      type,
    );

    if (type === "normal") {
      // Delete the special day if type is 'normal'
      const result = await pool.query(
        `DELETE FROM special_days_${school} WHERE date = $1 RETURNING *`,
        [date],
      );
      console.log("✅ Special day removed:", date);
      res.json({ message: "Special day removed", deleted: result.rows[0] });
    } else if (allowedTypes.includes(type)) {
      const result = await pool.query(
        `INSERT INTO special_days_${school} (date, type, description) VALUES ($1, $2, $3) 
         ON CONFLICT (date) DO UPDATE SET type = EXCLUDED.type, description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP 
         RETURNING *`,
        [date, type, description || ""],
      );

      console.log("✅ Special day updated:", result.rows[0]);
      res.json(result.rows[0]);
    } else {
      return res.status(400).json({ 
        error: "Invalid special day type",
        allowedTypes: allowedTypes
      });
    }
  } catch (error) {
    console.error(
      `❌ Error updating special day for ${req.params.school}:`,
      error,
    );
    res.status(500).json({
      error: "Failed to update special day",
      details: error.message,
    });
  }
});

// School settings endpoints
app.get("/api/:school/settings", async (req, res) => {
  try {
    const { school } = req.params;
    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    const result = await pool.query(
      "SELECT settings FROM school_settings WHERE school = $1",
      [school],
    );

    if (result.rows.length === 0) {
      // Return default settings with enhanced options
      const defaultSettings = {
        styles: {
          title: {
            fontSize: "24px",
            color: "#333",
            fontFamily: "Segoe UI",
            textAlign: "center",
          },
          dates: { fontSize: "16px", color: "#333", fontFamily: "Segoe UI" },
          events: { fontSize: "11px", color: "white", fontFamily: "Segoe UI" },
          gridLines: { color: "#f8f9fa" },
          departmentButtons: { fontSize: "12px", fontFamily: "Segoe UI" },
        },
      };
      return res.json(defaultSettings);
    }

    res.json(result.rows[0].settings);
  } catch (error) {
    console.error(
      `❌ Error fetching settings for ${req.params.school}:`,
      error,
    );
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

app.put("/api/:school/settings", requireAdmin, async (req, res) => {
  try {
    const { school } = req.params;
    const { settings } = req.body;

    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    const result = await pool.query(
      `INSERT INTO school_settings (school, settings) VALUES ($1, $2) 
       ON CONFLICT (school) DO UPDATE SET settings = EXCLUDED.settings, updated_at = CURRENT_TIMESTAMP 
       RETURNING *`,
      [school, JSON.stringify(settings)],
    );

    console.log(`✅ Settings updated for ${school.toUpperCase()}`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error(
      `❌ Error updating settings for ${req.params.school}:`,
      error,
    );
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// Enhanced school banners endpoints with style options
app.get("/api/:school/banner", async (req, res) => {
  try {
    const { school } = req.params;
    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    const result = await pool.query(
      "SELECT * FROM school_banners WHERE school = $1 AND is_active = true",
      [school],
    );

    if (result.rows.length === 0) {
      return res.json({ 
        message: null, 
        is_active: false,
        text_size: "16px",
        text_color: "#ffffff",
        background_color: "#ff6b6b"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(`❌ Error fetching banner for ${req.params.school}:`, error);
    res.status(500).json({ error: "Failed to fetch banner" });
  }
});

app.put("/api/:school/banner", requireAdmin, async (req, res) => {
  try {
    const { school } = req.params;
    const { message, is_active, text_size, text_color, background_color } = req.body;

    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    const result = await pool.query(
      `INSERT INTO school_banners (school, message, is_active, text_size, text_color, background_color) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       ON CONFLICT (school) DO UPDATE SET 
         message = EXCLUDED.message, 
         is_active = EXCLUDED.is_active,
         text_size = EXCLUDED.text_size,
         text_color = EXCLUDED.text_color,
         background_color = EXCLUDED.background_color,
         updated_at = CURRENT_TIMESTAMP 
       RETURNING *`,
      [
        school, 
        message || "", 
        is_active !== false,
        text_size || "16px",
        text_color || "#ffffff", 
        background_color || "#ff6b6b"
      ],
    );

    console.log(`✅ Banner updated for ${school.toUpperCase()}`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error(`❌ Error updating banner for ${req.params.school}:`, error);
    res.status(500).json({ error: "Failed to update banner" });
  }
});

// Enhanced custom links endpoints with style options
app.get("/api/:school/links", async (req, res) => {
  try {
    const { school } = req.params;
    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    const result = await pool.query(
      "SELECT * FROM custom_links WHERE school = $1 ORDER BY position, order_index",
      [school],
    );

    // Group by position
    const links = {
      left: result.rows.filter((link) => link.position === "left"),
      right: result.rows.filter((link) => link.position === "right"),
    };

    res.json(links);
  } catch (error) {
    console.error(`❌ Error fetching links for ${req.params.school}:`, error);
    res.status(500).json({ error: "Failed to fetch links" });
  }
});

app.post("/api/:school/links", requireAdmin, async (req, res) => {
  try {
    const { school } = req.params;
    const { 
      position, 
      title, 
      url, 
      order_index, 
      text_size, 
      text_color, 
      background_color 
    } = req.body;

    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    if (!["left", "right"].includes(position)) {
      return res.status(400).json({ error: "Position must be left or right" });
    }

    const result = await pool.query(
      `INSERT INTO custom_links 
       (school, position, title, url, order_index, text_size, text_color, background_color) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        school, 
        position, 
        title, 
        url, 
        order_index || 0,
        text_size || "12px",
        text_color || "#ffffff",
        background_color || "#667eea"
      ],
    );

    console.log(`✅ Link added for ${school.toUpperCase()}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(`❌ Error adding link for ${req.params.school}:`, error);
    res.status(500).json({ error: "Failed to add link" });
  }
});

app.put("/api/:school/links/:id", requireAdmin, async (req, res) => {
  try {
    const { school, id } = req.params;
    const { 
      title, 
      url, 
      order_index, 
      text_size, 
      text_color, 
      background_color 
    } = req.body;

    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    const result = await pool.query(
      `UPDATE custom_links SET 
         title = $1, 
         url = $2, 
         order_index = $3,
         text_size = $4,
         text_color = $5,
         background_color = $6
       WHERE id = $7 AND school = $8 RETURNING *`,
      [
        title, 
        url, 
        order_index || 0, 
        text_size || "12px",
        text_color || "#ffffff",
        background_color || "#667eea",
        id, 
        school
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Link not found" });
    }

    console.log(`✅ Link updated for ${school.toUpperCase()}`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error(`❌ Error updating link for ${req.params.school}:`, error);
    res.status(500).json({ error: "Failed to update link" });
  }
});

app.delete("/api/:school/links/:id", requireAdmin, async (req, res) => {
  try {
    const { school, id } = req.params;

    if (!validateSchool(school)) {
      return res.status(400).json({ error: "Invalid school" });
    }

    const result = await pool.query(
      "DELETE FROM custom_links WHERE id = $1 AND school = $2 RETURNING *",
      [id, school],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Link not found" });
    }

    console.log(`✅ Link deleted for ${school.toUpperCase()}`);
    res.json({ message: "Link deleted successfully" });
  } catch (error) {
    console.error(`❌ Error deleting link for ${req.params.school}:`, error);
    res.status(500).json({ error: "Failed to delete link" });
  }
});

// Serve the frontend
app.get("/", (req, res) => {
  try {
    const indexPath = path.join(__dirname, "public", "index.html");
    const fs = require("fs");
    if (fs.existsSync(indexPath)) {
      console.log("📄 Serving home page");
      res.sendFile(indexPath);
    } else {
      res.json({
        message: "Multi-School Calendar System",
        schools: ["WLHS", "WVHS"],
        endpoints: {
          wlhs: "/wlhs",
          wvhs: "/wvhs",
          api: "/api",
        },
      });
    }
  } catch (error) {
    console.error("❌ Error serving home page:", error);
    res.status(500).json({ error: "Could not serve home page" });
  }
});

// School-specific calendar pages
app.get("/:school", (req, res) => {
  const { school } = req.params;
  if (!validateSchool(school)) {
    return res.status(404).json({ error: "School not found" });
  }

  try {
    const calendarPath = path.join(__dirname, "public", "calendar.html");
    const fs = require("fs");
    if (fs.existsSync(calendarPath)) {
      console.log(`📄 Serving calendar for ${school.toUpperCase()}`);
      res.sendFile(calendarPath);
    } else {
      res.json({
        message: `${school.toUpperCase()} Calendar`,
        school: school.toUpperCase(),
        api_base: `/api/${school}`,
      });
    }
  } catch (error) {
    console.error(`❌ Error serving calendar for ${school}:`, error);
    res.status(500).json({ error: "Could not serve calendar" });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("🚨 Unhandled error:", error);
  console.error("Stack trace:", error.stack);
  res.status(500).json({
    error: "Internal server error",
    message: error.message,
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  console.log(`❓ 404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: "Route not found",
    path: req.path,
    method: req.method,
    available_routes: ["/", "/wlhs", "/wvhs", "/api/health", "/api/test"],
  });
});

// Start server
async function startServer() {
  try {
    console.log("🚀 Starting Enhanced Multi-School Calendar API server...");
    console.log("📊 Environment:", process.env.NODE_ENV || "development");
    console.log("🔌 Port:", PORT);

    console.log("🔄 Testing database connection...");
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    console.log("✅ Database connection test successful");

    await initializeDatabase();

    app.listen(PORT, () => {
      console.log("🎉 Enhanced Multi-School Calendar API server is running!");
      console.log(`📍 Server URL: http://localhost:${PORT}`);
      console.log(`🏠 Home page: http://localhost:${PORT}`);
      console.log(`🦁 WLHS Calendar: http://localhost:${PORT}/wlhs`);
      console.log(`🏔️  WVHS Calendar: http://localhost:${PORT}/wvhs`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
      console.log("📚 Enhanced features:");
      console.log("   - Font size dropdown controls (8-32px)");
      console.log("   - Custom link styling with color pickers");
      console.log("   - Enhanced banner controls");
      console.log("   - Restricted special day types (6 options)");
      console.log("   - Admin navigation between pages");
      console.log("   - Persistent admin sessions");
      console.log("");
      console.log("🔧 Ready for connections!");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    console.error("💡 Common issues:");
    console.error("   - Check DATABASE_URL in .env file");
    console.error("   - Verify Neon database is active");
    console.error("   - Check network connectivity");
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully");
  await pool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully");
  await pool.end();
  process.exit(0);
});

startServer().catch(console.error);