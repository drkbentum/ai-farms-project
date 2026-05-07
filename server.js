const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const XLSX = require('xlsx');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const EXCEL_FILE = path.join(__dirname, 'enrollments.xlsx');

const transporter = process.env.EMAIL_USER && process.env.EMAIL_PASS ? nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
}) : null;

const EMAIL_TO = process.env.EMAIL_TO || 'kbentum8786@tuskegee.edu';

if (transporter) {
    console.log('Email transporter configured. Sending to:', EMAIL_TO);
} else {
    console.log('WARNING: EMAIL_USER or EMAIL_PASS not set. Emails will not be sent.');
    console.log('Set these environment variables on Render to enable email forwarding.');
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

function sendEnrollmentEmail(data) {
    if (!transporter) {
        console.error('Email not sent: transporter not configured. Check EMAIL_USER and EMAIL_PASS env vars.');
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
        </table>
        <p><em>Submitted: ${new Date().toLocaleString()}</em></p>
    `;

    const mailOptions = {
        from: `"AI Farms Project" <${process.env.EMAIL_USER}>`,
        to: EMAIL_TO,
        subject: `New Enrollment: ${data.fullName} - ${data.animalTag}`,
        html: emailHtml
    };

    console.log('Attempting to send email to:', EMAIL_TO);

    transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
            console.error('Email FAILED:', err.message);
        } else {
            console.log('Email sent successfully. MessageId:', info.messageId);
        }
    });
}

app.get('/api/test-email', async (req, res) => {
    if (!transporter) {
        return res.json({ success: false, message: 'Email transporter not configured. Check EMAIL_USER and EMAIL_PASS.' });
    }
    try {
        await transporter.sendMail({
            from: `"AI Farms Project" <${process.env.EMAIL_USER}>`,
            to: EMAIL_TO,
            subject: 'Test Email',
            html: '<h2>Test</h2><p>If you see this, email is working!</p>'
        });
        res.json({ success: true, message: `Test email sent to ${EMAIL_TO}` });
    } catch (err) {
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

        sendEnrollmentEmail(data);

        res.json({ success: true, message: 'Enrollment submitted successfully' });
    } catch (error) {
        console.error('Error processing enrollment:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`AI Farms Project server running at http://localhost:${PORT}`);
    console.log(`Enrollment data will be saved to: ${EXCEL_FILE}`);
    exec(`start http://localhost:${PORT}/enroll.html`);
});
