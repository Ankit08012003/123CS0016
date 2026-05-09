const axios = require('axios');

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
        console.error(error.response ? error.response.data : error.message);
        throw error;
    }
};

const Log = async (stack, level, pkg, message) => {
    try {
        const token = await getAuthToken();
        await axios.post('http://4.224.186.213/evaluation-service/logs', {
            stack: stack,
            level: level,
            package: pkg,
            message: message
        }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`[Local Debug] Successfully logged to remote: [${level}] ${message}`);
    } catch (error) {
        console.error("[Local Debug] Failed to send log to remote server:", error.response ? error.response.data : error.message);
    }
};

module.exports = Log;