require('dotenv').config();
async function testAPI() {
    try {
        const loginRes = await fetch('http://localhost:4000/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: process.env.CMS_EMAIL, password: process.env.CMS_PASSWORD })
        });
        const loginData = await loginRes.json();
        console.log("Login:", loginData.role ? "Success" : "Failed");
        
        const msgRes = await fetch('http://localhost:4000/messages', {
            headers: { Authorization: `Bearer ${loginData.token}` }
        });
        console.log("Messages:", await msgRes.text());
        
        const attRes = await fetch('http://localhost:4000/attendance', {
            headers: { Authorization: `Bearer ${loginData.token}` }
        });
        console.log("Attendance:", await attRes.text());
    } catch (err) {
        console.error(err);
    }
}
testAPI();
