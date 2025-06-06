# School Calendar Backend - Neon PostgreSQL

A comprehensive backend system for the High School Calendar with Neon PostgreSQL database integration.

## Features

- **Full CRUD operations** for events, day labels, and special days
- **Grade-specific resources** with URL links for lessons and materials
- **Department filtering** (Athletics, ASB, Testing, Arts, Counselors, Life, Admin)
- **Special day types** (Finals, School Closed, Staff Development, etc.)
- **Day labeling system** (A day, B day, No school)
- **RESTful API** with proper error handling
- **Database migrations** and seeding
- **Admin mode** for calendar management

## Prerequisites

- Node.js (v16 or higher)
- A Neon PostgreSQL database account
- npm or yarn package manager

## Setup Instructions

### 1. Create Neon Database

1. Go to [Neon Console](https://console.neon.tech/)
2. Create a new project
3. Copy your connection string (it looks like: `postgresql://username:password@ep-cool-darkness-123456.us-east-2.aws.neon.tech/neondb?sslmode=require`)

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Update `.env` with your Neon database URL:
```env
DATABASE_URL=postgresql://username:password@ep-cool-darkness-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
PORT=3000
NODE_ENV=development
```

### 4. Project Structure

```
school-calendar-backend/
├── server.js              # Main Express server
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables (create from .env.example)
├── .env.example          # Environment template
├── public/               # Frontend files
│   ├── index.html        # Your existing HTML file
│   └── calendar.js       # Updated frontend JavaScript
└── README.md            # This file
```

### 5. Setup Frontend Files

1. Create a `public` folder in your project root
2. Copy your existing HTML file to `public/index.html`
3. Replace the JavaScript in your HTML file with the updated `calendar.js` content
4. Or include it as a separate file: `<script src="calendar.js"></script>`

### 6. Start the Server

For development:
```bash
npm run dev
```

For production:
```bash
npm start
```

The server will start on `http://localhost:3000`

### 7. Verify Setup

Visit `http://localhost:3000/api/health` to check if the database connection is working.

## API Endpoints

### Events
- `GET /api/events` - Get all events (with optional filters)
- `POST /api/events` - Create a new event
- `PUT /api/events/:id` - Update an event
- `DELETE /api/events/:id` - Delete an event

### Day Labels
- `GET /api/day-labels` - Get day labels (A/B day schedule)
- `PUT /api/day-labels/:date` - Set day label for a specific date

### Special Days
- `GET /api/special-days` - Get special days (finals, holidays, etc.)
- `PUT /api/special-days/:date` - Set special day type for a specific date

### Health Check
- `GET /api/health` - Database connection status

## Database Schema

### Events Table
```sql
events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  department VARCHAR(50) NOT NULL,
  description TEXT,
  materials TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

### Grade Resources Table
```sql
grade_resources (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  grade INTEGER NOT NULL CHECK (grade >= 9 AND grade <= 12),
  lessons_url TEXT,
  materials_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

### Day Labels Table
```sql
day_labels (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  label VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

### Special Days Table
```sql
special_days (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

## Usage Examples

### Creating an Event
```javascript
const eventData = {
  title: "Basketball Game vs. Riverside",
  date: "2025-06-15",
  department: "athletics",
  description: "Home game against Riverside High School",
  materials: "Team uniforms, water bottles, first aid kit",
  grades: {
    9: {
      lessons: "https://example.com/basketball-basics",
      materials: "https://example.com/grade9-materials"
    },
    10: {
      lessons: "https://example.com/intermediate-basketball",
      materials: "https://example.com/grade10-materials"
    }
  }
};

fetch('/api/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(eventData)
});
```

### Setting Day Labels
```javascript
// Set June 15th as an A day
fetch('/api/day-labels/2025-06-15', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ label: 'A' })
});
```

### Setting Special Days
```javascript
// Mark June 16th as a finals day
fetch('/api/special-days/2025-06-16', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    type: 'finals',
    description: 'Final exams begin'
  })
});
```

## Frontend Integration

The updated frontend JavaScript automatically:
- Loads events, day labels, and special days from the backend
- Saves new events to the database
- Updates day labels and special days in admin mode
- Shows success/error notifications
- Handles loading states and error conditions

## Deployment

### Deploy to Railway/Render/Heroku

1. Push your code to GitHub
2. Connect your repository to your deployment platform
3. Set the `DATABASE_URL` environment variable
4. Deploy!

### Environment Variables for Production
```env
DATABASE_URL=your_neon_database_url
NODE_ENV=production
PORT=3000
```

## Security Considerations

For production deployment, consider adding:
- Authentication/Authorization
- Rate limiting (already included)
- Input validation with Joi (dependency included)
- CORS restrictions
- Helmet for security headers (dependency included)

## Troubleshooting

### Database Connection Issues
1. Verify your Neon database URL is correct
2. Check that your Neon database is not suspended
3. Ensure SSL is enabled in the connection string

### Port Issues
- Change the PORT in your `.env` file if 3000 is taken
- Update the `apiBaseUrl` in the frontend if needed

### CORS Issues
- Update the `ALLOWED_ORIGINS` in your `.env` file
- Make sure your frontend URL is included

## Support

If you encounter issues:
1. Check the server logs for detailed error messages
2. Verify your environment variables are set correctly
3. Test the `/api/health` endpoint
4. Check your Neon database status in the console