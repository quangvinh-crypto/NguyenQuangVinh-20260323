let nodemailer = require('nodemailer')
const transporter = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io",
    port: 2525,
    secure: false, // Use true for port 465, false for port 587
    auth: {
        user: "18f89eb9d59fea",
        pass: "b9c07223b70c31",
    },
});

function buildUserPasswordHtml(username, password) {
    return `
        <h3>Welcome, ${username}</h3>
        <p>Your account has been created successfully.</p>
        <p><strong>Temporary password:</strong> ${password}</p>
        <p>Please login and change your password as soon as possible.</p>
    `;
}

module.exports = {
    sendMail: async function (to, url) {
        await transporter.sendMail({
            from: '"admin@" <admin@nnptud.com>',
            to: to,
            subject: "mail reset passwrod",
            text: "lick vo day de doi passs", // Plain-text version of the message
            html: "lick vo <a href=" + url + ">day</a> de doi passs", // HTML version of the message
        });
    },
    sendUserPasswordMail: async function (to, username, password) {
        await transporter.sendMail({
            from: '"admin@" <admin@nnptud.com>',
            to: to,
            subject: "Thong tin tai khoan moi",
            text: `Xin chao ${username}. Mat khau tam thoi cua ban la: ${password}`,
            html: buildUserPasswordHtml(username, password)
        });
    }
}
