const nodemailer = require('nodemailer');

exports.handler = async function(event, context) {
    const data = JSON.parse(event.body);

    // SMTP instellen (bijvoorbeeld Gmail)
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,  // je Gmail
            pass: process.env.EMAIL_PASS   // app password
        }
    });

    const mailOptions = {
        from: data.email,
        to: 'Zeno.Cominotto@gmail.com',
        subject: `Nieuw bericht van ${data.name}`,
        text: data.message
    };

    try {
        await transporter.sendMail(mailOptions);
        return { statusCode: 200, body: 'Email verzonden!' };
    } catch (error) {
        return { statusCode: 500, body: 'Fout bij verzenden: ' + error.message };
    }
};
