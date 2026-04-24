const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json"
};

exports.handler = async function(event) {
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers,
            body: ""
        };
    }

    if (event.httpMethod !== "GET") {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ message: "Methode niet toegestaan." })
        };
    }

    const siteKey = process.env.HCAPTCHA_SITE_KEY;
    const secretKey = process.env.HCAPTCHA_SECRET_KEY;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            hcaptchaSiteKey: siteKey && secretKey ? siteKey : ""
        })
    };
};
