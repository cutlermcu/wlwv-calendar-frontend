// debug.js - Simple debugging script to test your setup
require("dotenv").config();
const { Pool } = require("pg");

console.log("🔍 School Calendar Debug Script");
console.log("================================\n");

// Check environment variables
console.log("1. Checking environment variables...");
console.log("   NODE_ENV:", process.env.NODE_ENV || "not set");
console.log("   PORT:", process.env.PORT || "not set");
console.log(
  "   DATABASE_URL:",
  process.env.DATABASE_URL ? "set ✅" : "NOT SET ❌",
);

if (process.env.DATABASE_URL) {
  // Show partial URL for security
  const url = process.env.DATABASE_URL;
  const maskedUrl =
    url.substring(0, 20) + "..." + url.substring(url.length - 20);
  console.log("   DATABASE_URL preview:", maskedUrl);
} else {
  console.log("❌ DATABASE_URL is not set in environment variables!");
  console.log("💡 Create a .env file with your Neon database URL");
  process.exit(1);
}

// Test database connection
async function testConnection() {
  console.log("\n2. Testing database connection...");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      require: true,
    },
  });

  try {
    console.log("   Connecting to database...");
    const client = await pool.connect();

    console.log("   ✅ Connected successfully!");

    // Test basic query
    console.log("   Testing basic query...");
    const result = await client.query(
      "SELECT NOW() as current_time, version() as version",
    );
    console.log("   ✅ Query successful!");
    console.log("   Current time:", result.rows[0].current_time);
    console.log("   PostgreSQL version:", result.rows[0].version.split(" ")[0]);

    client.release();

    // Test table creation
    console.log("\n3. Testing table creation...");
    const testClient = await pool.connect();

    await testClient.query(`
      CREATE TABLE IF NOT EXISTS debug_test (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("   ✅ Table creation successful!");

    // Insert test data
    await testClient.query("INSERT INTO debug_test DEFAULT VALUES");
    const testResult = await testClient.query(
      "SELECT COUNT(*) as count FROM debug_test",
    );
    console.log("   ✅ Data insertion successful!");
    console.log("   Test records:", testResult.rows[0].count);

    // Clean up
    await testClient.query("DROP TABLE debug_test");
    console.log("   ✅ Cleanup successful!");

    testClient.release();

    console.log(
      "\n🎉 All tests passed! Your database setup is working correctly.",
    );
    console.log("💡 If the server is still showing errors, check:");
    console.log("   - Your .env file is in the project root");
    console.log("   - You have all required npm packages installed");
    console.log("   - Port 3000 is not already in use");
  } catch (error) {
    console.log("\n❌ Database test failed!");
    console.error("Error details:", error.message);
    console.error("Error code:", error.code || "UNKNOWN");

    if (error.code === "ENOTFOUND") {
      console.log("\n💡 Troubleshooting ENOTFOUND:");
      console.log("   - Check your DATABASE_URL is correct");
      console.log("   - Verify your internet connection");
      console.log("   - Make sure Neon database is not suspended");
    } else if (error.code === "28000") {
      console.log("\n💡 Troubleshooting authentication:");
      console.log("   - Check username and password in DATABASE_URL");
      console.log("   - Verify database name is correct");
    } else if (error.code === "3D000") {
      console.log("\n💡 Troubleshooting database not found:");
      console.log("   - Check database name in your URL");
      console.log("   - Verify the database exists in Neon console");
    }

    console.log("\n🔗 Need help? Check:");
    console.log("   - Neon Console: https://console.neon.tech/");
    console.log("   - Your DATABASE_URL format should be:");
    console.log("     postgresql://user:pass@host/dbname?sslmode=require");
  } finally {
    await pool.end();
  }
}

// Check dependencies
console.log("\n4. Checking required packages...");
const requiredPackages = ["express", "cors", "pg", "dotenv"];

for (const pkg of requiredPackages) {
  try {
    require(pkg);
    console.log(`   ✅ ${pkg} - installed`);
  } catch (error) {
    console.log(`   ❌ ${pkg} - NOT INSTALLED`);
    console.log("   Run: npm install " + pkg);
  }
}

// Run the test
testConnection().catch(console.error);
