const express = require('express');
const axios = require('axios');
const Log = require('../logging_middleware/logger');

const app = express();
const PORT = 3000;

app.use(express.json());

let accessToken = "";

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

const fetchDepots = async (token) => {
    try {
        await Log("backend", "info", "service", "Fetching depots data");
        const response = await axios.get('http://4.224.186.213/evaluation-service/depots', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        await Log("backend", "info", "service", `Successfully fetched ${response.data.depots.length} depots`);
        return response.data.depots;
    } catch (error) {
        await Log("backend", "error", "service", "Error fetching depots data");
        throw error;
    }
};

const fetchVehicles = async (token) => {
    try {
        await Log("backend", "info", "service", "Fetching vehicles data");
        const response = await axios.get('http://4.224.186.213/evaluation-service/vehicles', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        await Log("backend", "info", "service", `Successfully fetched ${response.data.vehicles.length} vehicles`);
        return response.data.vehicles;
    } catch (error) {
        await Log("backend", "error", "service", "Error fetching vehicles data");
        throw error;
    }
};

// Exposing the logic as a REST API endpoint
app.get('/schedule', async (req, res) => {
    try {
        await Log("backend", "info", "route", "Received request to schedule vehicles");

        const token = await getAuthToken();
        const depots = await fetchDepots(token);
        const vehicles = await fetchVehicles(token);

        await Log("backend", "info", "service", "Calculating total mechanic hour budget");
        let totalBudget = 0;
        for (const depot of depots) {
            totalBudget += parseInt(depot.MechanicHours);
        }

        const n = vehicles.length;
        const dp = Array.from({ length: n + 1 }, () => Array(totalBudget + 1).fill(0));

        await Log("backend", "info", "service", "Running Knapsack DP algorithm");

        for (let i = 1; i <= n; i++) {
            const duration = vehicles[i - 1].Duration;
            const impact = vehicles[i - 1].Impact;

            for (let w = 1; w <= totalBudget; w++) {
                if (duration <= w) {
                    dp[i][w] = Math.max(dp[i - 1][w], dp[i - 1][w - duration] + impact);
                } else {
                    dp[i][w] = dp[i - 1][w];
                }
            }
        }

        let maxImpact = dp[n][totalBudget];
        let w = totalBudget;
        const selectedTasks = [];

        for (let i = n; i > 0 && maxImpact > 0; i--) {
            if (maxImpact !== dp[i - 1][w]) {
                selectedTasks.push(vehicles[i - 1].TaskID);
                maxImpact -= vehicles[i - 1].Impact;
                w -= vehicles[i - 1].Duration;
            }
        }

        const result = {
            TotalBudget: totalBudget,
            MaxImpactAchieved: dp[n][totalBudget],
            SelectedVehiclesCount: selectedTasks.length,
            SelectedTaskIDs: selectedTasks
        };

        await Log("backend", "info", "route", "Successfully generated scheduling result");

        // Returning the JSON response
        res.status(200).json(result);

    } catch (error) {
        await Log("backend", "error", "route", "Failed to process schedule request");
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log("Send a GET request to http://localhost:3000/schedule from Postman");
});