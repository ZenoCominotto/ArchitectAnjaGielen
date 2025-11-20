const nodemailer = require("nodemailer");

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

exports.handler = async function(event, context) {
    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        // Step 1: Parse request body
        console.log("Step 1: Parsing request body...");
        let data;
        try {
            if (!event.body) {
                throw new Error("Request body is missing");
            }
            data = JSON.parse(event.body);
            console.log("Step 1: Success - Body parsed. Name:", data.name, "Email:", data.email);
        } catch (parseError) {
            console.error("Step 1: Error parsing body -", parseError.message);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    message: "Fout bij lezen van formuliergegevens", 
                    error: parseError.message,
                    step: "parsing_request_body"
                })
            };
        }

        // Step 2: Check environment variables
        console.log("Step 2: Checking environment variables...");
        const emailUser = process.env.EMAIL_NEW;
        const emailPass = process.env.EMAIL_PASS_NEW;
        
        if (!emailUser) {
            console.error("Step 2: Error - EMAIL_NEW is not set");
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    message: "Server configuratie fout: EMAIL_NEW niet ingesteld", 
                    error: "Missing EMAIL_NEW environment variable",
                    step: "checking_environment_variables"
                })
            };
        }
        
        if (!emailPass) {
            console.error("Step 2: Error - EMAIL_PASS_NEW is not set");
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    message: "Server configuratie fout: EMAIL_PASS_NEW niet ingesteld", 
                    error: "Missing EMAIL_PASS_NEW environment variable",
                    step: "checking_environment_variables"
                })
            };
        }
        console.log("Step 2: Success - Environment variables found. User:", emailUser);

        // Step 3: Create transporter
        console.log("Step 3: Creating Gmail SMTP transporter...");
        let transporter;
        try {
            transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    user: emailUser,
                    pass: emailPass
                }
            });
            console.log("Step 3: Success - Gmail transporter created");
        } catch (transporterError) {
            console.error("Step 3: Error creating transporter -", transporterError.message);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    message: "Fout bij opzetten email verbinding", 
                    error: transporterError.message,
                    step: "creating_transporter"
                })
            };
        }

        // Step 4: Verify transporter connection
        console.log("Step 4: Verifying SMTP connection...");
        try {
            await transporter.verify();
            console.log("Step 4: Success - SMTP connection verified");
        } catch (verifyError) {
            console.error("Step 4: Error verifying connection -", verifyError.message);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    message: "Fout bij verifiëren email verbinding", 
                    error: verifyError.message,
                    step: "verifying_smtp_connection"
                })
            };
        }

        // Step 5: Prepare mail options
        console.log("Step 5: Preparing mail options...");
        let mailOptions = {
            from: `"Architect Gielen website" <${emailUser}>`,
            to: "architecgielen.site@gmail.com",
            subject: `Nieuw bericht van ${data.name}`,
            text: data.message,
            replyTo: data.email
        };
        console.log("Step 5: Success - Mail options prepared. Subject:", mailOptions.subject);

        // Step 6: Send email
        console.log("Step 6: Sending email...");
        try {
            const info = await transporter.sendMail(mailOptions);
            console.log("Step 6: Success - Email sent. Message ID:", info.messageId);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    message: "Email succesvol verstuurd!",
                    messageId: info.messageId
                })
            };
        } catch (sendError) {
            console.error("Step 6: Error sending email -", sendError.message);
            console.error("Step 6: Full error -", JSON.stringify(sendError, null, 2));
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    message: "Fout bij verzenden email", 
                    error: sendError.message,
                    errorCode: sendError.code,
                    step: "sending_email"
                })
            };
        }
    } catch (error) {
        // Catch any unexpected errors
        console.error("Unexpected error:", error.message);
        console.error("Full error:", JSON.stringify(error, null, 2));
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                message: "Onverwachte fout opgetreden", 
                error: error.message,
                step: "unexpected_error"
            })
        };
    }
};
