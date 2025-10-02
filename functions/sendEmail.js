const nodemailer = require("nodemailer");

exports.handler = async function(event, context) {
    const data = JSON.parse(event.body);

    // SMTP instellen (Gmail)
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER, // jouw Gmail
            pass: process.env.EMAIL_PASS  // app password
        }
    });

    // Mail opties
    let mailOptions = {
        from: process.env.EMAIL_USER,    // van wie de mail komt (jouw Gmail)
        to: process.env.EMAIL_USER,      // waar je het ontvangt
        subject: `Nieuw bericht van ${data.name}`,
        text: data.message,
        replyTo: data.email               // dit zorgt dat RE: naar de bezoeker gaat
    };

    try {
        await transporter.sendMail(mailOptions);
        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Email succesvol verstuurd!" })
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Fout bij verzenden email", error })
        };
    }
};
