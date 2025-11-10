require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// ✅ Connect MySQL
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectionLimit: 10,
});

// ✅ MOCK Course Data (sementara sampai Course Service temanmu jadi)
const mockCourses = [
    { id: 1, day: "Monday", start_time: "10:00", end_time: "12:00" },
    { id: 2, day: "Monday", start_time: "11:00", end_time: "13:00" },
    { id: 3, day: "Tuesday", start_time: "08:00", end_time: "10:00" }
];

// ✅ GET mock course (sementara)
app.get('/mock/courses/:id', (req, res) => {
    const course = mockCourses.find(c => c.id == req.params.id);
    if (!course) return res.status(404).json({ error: "Kursus tidak ditemukan" });
    res.json(course);
});

// ✅ GET enrollments
app.get('/enrollments', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM enrollments ORDER BY created_at DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ✅ POST enrollments — dengan urutan logika yang benar
app.post('/enrollments', async (req, res) => {
    try {
        const { student_id, course_id, teacher_id } = req.body;

        if (!student_id || !course_id || !teacher_id) {
            return res.status(400).json({
                error: "student_id, course_id, and teacher_id are required"
            });
        }

        // ✅ Ambil semua course yang diikuti student ini
        const [studentEnrollments] = await pool.query(
            "SELECT course_id FROM enrollments WHERE student_id = ?",
            [student_id]
        );

        const newCourse = mockCourses.find(c => c.id == course_id);
        if (!newCourse) {
            return res.status(404).json({ error: "Kursus tidak ditemukan" });
        }

        // ✅ Cek jadwal bentrok
        for (const row of studentEnrollments) {
    const currentCourse = mockCourses.find(c => c.id == row.course_id);

    // ⛔ lewati kalau course-nya sama dengan course baru
    if (currentCourse && currentCourse.id === newCourse.id) continue;

    // ✅ cek bentroknya baru dijalankan kalau course berbeda
    if (
        currentCourse &&
        currentCourse.day === newCourse.day &&
        !(
            currentCourse.end_time <= newCourse.start_time ||
            newCourse.end_time <= currentCourse.start_time
        )
    ) {
        return res.status(409).json({
            error: "Jadwal kursus bentrok dengan course yang sudah diikuti"
        });
    }
}

        // ✅ Cek duplicate enroll (setelah cek bentrok)
        const [exists] = await pool.query(
            "SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?",
            [student_id, course_id]
        );

        if (exists.length > 0) {
            return res.status(409).json({
                error: "Siswa sudah terdaftar dalam kursus ini"
            });
        }

        // ✅ Insert data ke database
        await pool.query(
            "INSERT INTO enrollments (student_id, course_id, teacher_id) VALUES (?, ?, ?)",
            [student_id, course_id, teacher_id]
        );

        res.status(201).json({
            message: "Jadwal kursus berhasil ditambahkan"
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ✅ Test endpoint
app.get('/', (req, res) => {
    res.json({ message: "Enrollment Service API is running!" });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
    console.log(`Enrollment Service running on port ${PORT}`);
});
