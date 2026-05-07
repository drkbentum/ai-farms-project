const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const XLSX = require('xlsx');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const EXCEL_FILE = path.join(__dirname, 'enrollments.xlsx');

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const EMAIL_TO = process.env.EMAIL_TO || 'kbentum@tuskegee.edu';
const EMAIL_FROM = process.env.EMAIL_FROM || 'dockbentum2@gmail.com';

if (SENDGRID_API_KEY) {
    console.log('SendGrid email configured. Sending to:', EMAIL_TO);
} else {
    console.log('WARNING: SENDGRID_API_KEY not set. Emails will not be sent.');
    console.log('1. Sign up at https://signup.sendgrid.com (free, 100 emails/day)');
    console.log('2. Create an API key with "Mail Send" permission');
    console.log('3. Set SENDGRID_API_KEY on Render environment variables');
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'pictures');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

function getOrCreateWorkbook() {
    let workbook;
    let worksheet;

    if (fs.existsSync(EXCEL_FILE)) {
        workbook = XLSX.readFile(EXCEL_FILE);
        worksheet = workbook.Sheets[workbook.SheetNames[0]];
    } else {
        worksheet = XLSX.utils.json_to_sheet([]);
        worksheet['!cols'] = [
            { wch: 22 }, { wch: 35 }, { wch: 35 }, { wch: 35 }, { wch: 35 }, { wch: 35 },
            { wch: 40 }, { wch: 25 }, { wch: 28 }, { wch: 28 }, { wch: 28 },
            { wch: 40 }
        ];
        workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Enrollments');
    }

    return { workbook, worksheet };
}

function appendToExcel(data) {
    const { workbook, worksheet } = getOrCreateWorkbook();

    const lastRow = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']).e.r + 1 : 0;

    if (lastRow === 0) {
    const headers = [
        'Submission Date',
        'Farmer Information - Full Name', 'Farmer Information - Email Address',
        'Farmer Information - Phone Number', 'Farmer Information - Farm Name',
        'Farmer Information - Farm Location',
        'Animal Information - Animal Tag/ID Number', 'Animal Information - Breed',
        'Animal Information - Age (months)', 'Animal Information - Gender',
        'Animal Information - Weight (kg)',
        'Muzzle Photo Upload - Photo Filename'
    ];
        headers.forEach((header, i) => {
            const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
            worksheet[cellRef] = { t: 's', v: header };
        });
    }

    const row = lastRow === 0 ? 1 : lastRow;
    const rowData = [
        new Date().toLocaleString(),
        data.fullName,
        data.email,
        data.phone,
        data.farmName,
        data.location,
        data.animalTag,
        data.breed,
        data.age,
        data.gender,
        data.weight || 'N/A',
        data.photoFilename || 'N/A'
    ];

    rowData.forEach((value, i) => {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: i });
        worksheet[cellRef] = { t: typeof value === 'number' ? 'n' : 's', v: value };
    });

    worksheet['!ref'] = XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: row, c: rowData.length - 1 }
    });

    XLSX.writeFile(workbook, EXCEL_FILE);
}

function sendViaSendGrid(payload) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const options = {
            hostname: 'api.sendgrid.com',
            path: '/v3/mail/send',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SENDGRID_API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ success: true, messageId: data });
                } else {
                    reject(new Error(`SendGrid API ${res.statusCode}: ${data}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
        req.write(body);
        req.end();
    });
}

function sendEnrollmentEmail(data, photoPath) {
    if (!SENDGRID_API_KEY) {
        console.error('Email not sent: SENDGRID_API_KEY not set.');
        return;
    }

    const emailHtml = `
        <h2>New Animal Enrollment</h2>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
            <tr><td><strong>Farmer Name</strong></td><td>${data.fullName}</td></tr>
            <tr><td><strong>Email</strong></td><td>${data.email}</td></tr>
            <tr><td><strong>Phone</strong></td><td>${data.phone}</td></tr>
            <tr><td><strong>Farm Name</strong></td><td>${data.farmName}</td></tr>
            <tr><td><strong>Farm Location</strong></td><td>${data.location}</td></tr>
            <tr><td><strong>Animal Tag</strong></td><td>${data.animalTag}</td></tr>
            <tr><td><strong>Breed</strong></td><td>${data.breed}</td></tr>
            <tr><td><strong>Age</strong></td><td>${data.age} months</td></tr>
            <tr><td><strong>Gender</strong></td><td>${data.gender}</td></tr>
            <tr><td><strong>Weight</strong></td><td>${data.weight || 'N/A'} kg</td></tr>
            <tr><td><strong>Muzzle Photo</strong></td><td>${data.photoFilename ? 'Attached' : 'Not provided'}</td></tr>
        </table>
        <p><em>Submitted: ${new Date().toLocaleString()}</em></p>
    `;

    const payload = {
        personalizations: [{ to: [{ email: EMAIL_TO }] }],
        from: { email: EMAIL_FROM, name: 'AI Farms Project' },
        subject: `New Enrollment: ${data.fullName} - ${data.animalTag}`,
        content: [{ type: 'text/html', value: emailHtml }]
    };

    if (photoPath && fs.existsSync(photoPath)) {
        const photoData = fs.readFileSync(photoPath);
        payload.attachments = [{
            content: photoData.toString('base64'),
            filename: data.photoFilename,
            type: 'image/jpeg',
            disposition: 'attachment'
        }];
    }

    console.log('Sending email via SendGrid to:', EMAIL_TO);

    sendViaSendGrid(payload).then(result => {
        console.log('Email sent successfully:', result.messageId);
    }).catch(err => {
        console.error('Email FAILED:', err.message);
    });
}

app.get('/api/test-email', async (req, res) => {
    if (!SENDGRID_API_KEY) {
        return res.json({ success: false, message: 'SENDGRID_API_KEY not set. Sign up at https://signup.sendgrid.com and create an API key.' });
    }
    try {
        const result = await sendViaSendGrid({
            personalizations: [{ to: [{ email: EMAIL_TO }] }],
            from: { email: EMAIL_FROM, name: 'AI Farms Project' },
            subject: 'Test Email from AI Farms',
            content: [{ type: 'text/html', value: '<h2>Test</h2><p>Email is working!</p>' }]
        });
        res.json({ success: true, message: `Test email sent to ${EMAIL_TO}`, messageId: result.messageId });
    } catch (err) {
        console.error('Test email FAILED:', err);
        res.json({ success: false, message: err.message });
    }
});

app.post('/api/enroll', upload.single('muzzlePhoto'), (req, res) => {
    try {
        console.log('Received enrollment request');
        console.log('Body:', req.body);
        console.log('File:', req.file ? req.file.filename : 'none');

        const data = JSON.parse(req.body.data || '{}');
        console.log('Parsed data:', data);

        if (req.file) {
            data.photoFilename = req.file.filename;
        }

        appendToExcel(data);
        console.log('Enrollment saved to:', EXCEL_FILE);

        sendEnrollmentEmail(data, req.file ? req.file.path : null);

        res.json({ success: true, message: 'Enrollment submitted successfully' });
    } catch (error) {
        console.error('Error processing enrollment:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

const ADMIN_PASSWORD = 'ai-project26tu';
const AUTH_SECRET = crypto.randomBytes(32).toString('hex');
const AUTH_TOKEN = crypto.createHash('sha256').update(ADMIN_PASSWORD + AUTH_SECRET).digest('hex');

function parseCookies(req) {
    const header = req.headers.cookie;
    if (!header) return {};
    return header.split(';').reduce((acc, c) => {
        const [k, ...v] = c.split('=');
        acc[k.trim()] = v.join('=').trim();
        return acc;
    }, {});
}

function requireAuth(req, res, next) {
    const cookies = parseCookies(req);
    if (cookies.admin_token === AUTH_TOKEN) return next();
    if (req.path === '/login') return next();
    res.redirect('/enrolled/login');
}

app.get('/enrolled/login', (req, res) => {
    const cookies = parseCookies(req);
    if (cookies.admin_token === AUTH_TOKEN) return res.redirect('/enrolled');
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Login</title><style>body{font-family:Arial,sans-serif;background:#f5f5f5;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}.login-box{background:#fff;padding:40px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.1);text-align:center;max-width:400px;width:90%}.login-box h1{color:#2c5f2d;margin-bottom:8px;font-size:24px}.login-box p{color:#666;margin-bottom:24px}.login-box input{width:100%;padding:12px;border:1px solid #ddd;border-radius:4px;font-size:16px;box-sizing:border-box;margin-bottom:16px}.login-box button{width:100%;padding:12px;background:#2c5f2d;color:#fff;border:none;border-radius:4px;font-size:16px;cursor:pointer}.login-box button:hover{background:#1e4520}.error{color:#c00;margin-bottom:12px}</style></head><body><div class="login-box"><h1>Enrolled Dashboard</h1><p>Enter password to access</p><form method="POST" action="/enrolled/login">${req.query.error ? '<div class="error">Wrong password</div>' : ''}<input type="password" name="password" placeholder="Password" required autofocus><button type="submit">Login</button></form></div></body></html>`);
});

app.post('/enrolled/login', (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) {
        res.setHeader('Set-Cookie', `admin_token=${AUTH_TOKEN}; HttpOnly; Path=/; Max-Age=${86400 * 7}; SameSite=Lax`);
        res.redirect('/enrolled');
    } else {
        res.redirect('/enrolled/login?error=1');
    }
});

app.get('/enrolled/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'admin_token=; HttpOnly; Path=/; Max-Age=0');
    res.redirect('/enrolled/login');
});

app.get('/enrolled/download', requireAuth, (req, res) => {
    if (!fs.existsSync(EXCEL_FILE)) return res.status(404).send('No enrollments yet');
    res.download(EXCEL_FILE, `enrollments_${new Date().toISOString().slice(0,10)}.xlsx`);
});

app.use('/enrolled', requireAuth);
app.get('/enrolled', (req, res) => {
    let rows = [];
    if (fs.existsSync(EXCEL_FILE)) {
        const wb = XLSX.readFile(EXCEL_FILE);
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    }

    const picsDir = path.join(__dirname, 'pictures');
    let picFiles = [];
    if (fs.existsSync(picsDir)) picFiles = fs.readdirSync(picsDir);

    const tableRows = rows.map((r, i) => {
        const filename = r['Muzzle Photo Upload - Photo Filename'];
        const hasPhoto = filename && filename !== 'N/A' && picFiles.includes(filename);
        return `<tr>${Object.values(r).map(v => `<td>${String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>`).join('')}<td>${hasPhoto ? `<a href="/pictures/${filename}" target="_blank"><img src="/pictures/${filename}" style="width:80px;height:60px;object-fit:cover;border-radius:4px;cursor:pointer" alt="Photo"></a>` : 'N/A'}</td></tr>`;
    }).join('\n');

    const headers = Object.keys(rows[0] || {}).concat(['Photo']);

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Enrolled Dashboard - AI Farms</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0}.header{background:#2c5f2d;color:#fff;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}.header h1{margin:0;font-size:22px}.header a{color:#fff;text-decoration:none;background:rgba(255,255,255,.2);padding:8px 16px;border-radius:4px;font-size:14px}.header a:hover{background:rgba(255,255,255,.3)}.container{max-width:1400px;margin:0 auto;padding:16px}.stats{display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap}.stat-card{background:#fff;padding:16px 24px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.1);flex:1;min-width:150px;text-align:center}.stat-card h3{margin:0 0 4px;color:#666;font-size:13px;text-transform:uppercase}.stat-card .num{font-size:28px;font-weight:700;color:#2c5f2d}.table-wrap{background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.1);overflow-x:auto;padding:0}table{width:100%;border-collapse:collapse;font-size:13px;min-width:1200px}th{background:#2c5f2d;color:#fff;padding:10px 8px;text-align:left;white-space:nowrap;position:sticky;top:0;font-size:12px}td{padding:8px;border-bottom:1px solid #eee;vertical-align:middle}tr:hover{background:#f0f7f0}.empty{padding:48px;text-align:center;color:#999;font-size:18px}.empty p{margin:8px 0}.footer{text-align:center;padding:24px;color:#999;font-size:13px}@media(max-width:768px){.header h1{font-size:18px}.stat-card .num{font-size:22px}}</style></head><body><div class="header"><h1>Enrolled Dashboard</h1><div><a href="/enrolled/download">Download Excel</a><a href="/enrolled/logout" style="margin-left:8px">Logout</a></div></div><div class="container"><div class="stats"><div class="stat-card"><h3>Total Enrollments</h3><div class="num">${rows.length}</div></div><div class="stat-card"><h3>Photos Uploaded</h3><div class="num">${rows.filter(r => { const f = r['Muzzle Photo Upload - Photo Filename']; return f && f !== 'N/A'; }).length}</div></div><div class="stat-card"><h3>Pictures Folder</h3><div class="num">${picFiles.length}</div></div></div><div class="table-wrap">${rows.length ? `<table><thead><tr>${headers.map(h => `<th>${h.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table>` : '<div class="empty"><p>No enrollments yet</p><p>Data will appear here once farmers submit the enrollment form.</p></div>'}</div></div><div class="footer">AI Farms Project &copy; ${new Date().getFullYear()}</div></body></html>`);
});

app.listen(PORT, () => {
    console.log(`AI Farms Project server running at http://localhost:${PORT}`);
    console.log(`Enrollment data will be saved to: ${EXCEL_FILE}`);
    exec(`start http://localhost:${PORT}/enroll.html`);
});
