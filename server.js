const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const XLSX = require('xlsx');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;
const EXCEL_FILE = path.join(__dirname, 'enrollments.xlsx');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
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
