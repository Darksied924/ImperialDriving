require("dotenv").config();

const express = require("express");
const pool = require("./src/config/db");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Home route
app.get("/", (req, res) => {
    res.send("Imperial Driving School Management System");
});

// Application health check
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        application: "Imperial Driving School Management System"
    });
});

// Database health check
app.get("/health/db", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW() AS time");

        res.json({
            status: "ok",
            database: "connected",
            time: result.rows[0].time
        });
    } catch (error) {
        console.error("Database connection error:", error);

        res.status(500).json({
            status: "error",
            database: "disconnected"
        });
    }
});

// Start application
async function startServer() {
    try {
        // Verify database connection before starting Express
        await pool.query("SELECT 1");

        console.log("PostgreSQL connected");

        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Failed to connect to PostgreSQL:");
        console.error(error.message);

        process.exit(1);
    }
}

startServer();