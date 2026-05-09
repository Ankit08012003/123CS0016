const express = require('express');
const axios = require('axios');
const Log = require('../logging_middleware/logger');

const app = express();
const PORT = 3001; // Using 3001 to avoid conflict with previous task

app.use(express.json());

let accessToken = "";

// Authentication function
const getAuthToken = async () => {
    if (accessToken) return accessToken;
    try {
        const response = await axios.post('http://4.224.186.213/evaluation-service/auth', {
            email: "123cs0016@iiitk.ac.in",
            name: "ankit kumar",
            rollNo: "123cs0016",
            accessCode: "uZySAT",
            clientID: "1e0ffbbc-aed0-427e-b148-cc96247b31b3",
            clientSecret: "mjTGznaMVqgjwwam"
        });
        accessToken = response.data.access_token;
        return accessToken;
    } catch (error) {
        await Log("backend", "fatal", "auth", "Failed to generate auth token");
        throw error;
    }
};

// Priority Weights Mapping
const PRIORITY_WEIGHTS = {
    "Placement": 3,
    "Result": 2,
    "Event": 1
};

// Fetch notifications from API
const fetchNotifications = async (token) => {
    try {
        await Log("backend", "info", "service", "Fetching notifications data");
        const response = await axios.get('http://4.224.186.213/evaluation-service/notifications', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        await Log("backend", "info", "service", `Successfully fetched ${response.data.notifications.length} notifications`);
        return response.data.notifications;
    } catch (error) {
        await Log("backend", "error", "service", "Error fetching notifications data");
        throw error;
    }
};

// API Endpoint to get Top N Priority Notifications
app.get('/priority-inbox', async (req, res) => {
    try {
        await Log("backend", "info", "route", "Received request for priority inbox");
        
        // Get limit from query params (default to 10)
        const limit = parseInt(req.query.n) || 10;

        const token = await getAuthToken();
        const notifications = await fetchNotifications(token);

        await Log("backend", "info", "service", "Sorting notifications based on Weight and Recency");

        // Sorting Logic
        notifications.sort((a, b) => {
            const weightA = PRIORITY_WEIGHTS[a.Type] || 0;
            const weightB = PRIORITY_WEIGHTS[b.Type] || 0;

            // 1. Sort by Weight (Descending)
            if (weightA !== weightB) {
                return weightB - weightA; 
            }

            // 2. If weights are equal, sort by Recency/Timestamp (Descending)
            const timeA = new Date(a.Timestamp).getTime();
            const timeB = new Date(b.Timestamp).getTime();
            return timeB - timeA;
        });

        // Get Top N
        const topNotifications = notifications.slice(0, limit);

        await Log("backend", "info", "route", `Successfully generated top ${limit} priority notifications`);

        // Return Result
        res.status(200).json({
            success: true,
            totalProcessed: notifications.length,
            returnedCount: topNotifications.length,
            topNotifications: topNotifications
        });

    } catch (error) {
        await Log("backend", "error", "route", "Failed to process priority inbox request");
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.listen(PORT, () => {
    console.log(`Notification Priority Service is running on http://localhost:${PORT}`);
    console.log("Send a GET request to http://localhost:3001/priority-inbox from Postman");
});