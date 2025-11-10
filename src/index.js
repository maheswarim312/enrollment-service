require('dotenv').config();
const express = require('express');
const axios = require('axios');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const { checkAuth } = require('./middleware/auth.middleware.js');

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

const DURATION_IN_MINUTES = 120;
function parseTime(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours * 60) + minutes;
}

function checkClash(schedA, schedB) {
  if (schedA.day !== schedB.day) {
    return false;
  }

  const startA = parseTime(schedA.time);
  const endA = startA + DURATION_IN_MINUTES;
  const startB = parseTime(schedB.time);
  const endB = startB + DURATION_IN_MINUTES;

  const noClash = (endA <= startB) || (endB <= startA);

  return !noClash; // Kalau 'noClash' itu 'false', kalau 'clash' = 'true'
}

// ✅ GET enrollments
app.get('/api/enrollments', checkAuth, async (req, res) => {
    try {
        const { id: requesterId, role: requesterRole } = req.user;

        const { student_id, course_id } = req.query;

        let baseQuery = "SELECT * FROM enrollments";
        const queryParams = [];
        let whereClauses = [];

        if (requesterRole === 'murid') {
            whereClauses.push("student_id = ?");
            queryParams.push(requesterId);

        } else if (requesterRole === 'admin' || requesterRole === 'pengajar') {
            if (student_id) {
                whereClauses.push("student_id = ?");
                queryParams.push(student_id);
            } else if (course_id) {
                whereClauses.push("course_id = ?");
                queryParams.push(course_id);
            }
        }

        if (whereClauses.length > 0) {
            baseQuery += " WHERE " + whereClauses.join(" AND ");
        }
        baseQuery += " ORDER BY created_at DESC";
        
        const [rows] = await pool.query(baseQuery, queryParams);
        res.json(rows);
    
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/enrollments', checkAuth, async (req, res) => {
    try {
        const { id: requesterId, role: requesterRole } = req.user;
        const { student_id, course_id } = req.body;

        const COURSE_SERVICE_URL = process.env.COURSE_SERVICE_URL; // (Kita ganti nama env-nya)

        if (!student_id || !course_id) {
            return res.status(400).json({ error: "student_id dan course_id wajib diisi" });
        }

        if (requesterRole === 'murid' && requesterId !== student_id) {
            return res.status(403).json({ 
              error: "Akses ditolak: Murid hanya bisa mendaftarkan dirinya sendiri." 
            });
        }

        let newCourse;
        try {
            const token = req.headers['authorization'];
            const courseRes = await axios.get(`${COURSE_SERVICE_URL}/course/${course_id}`, {
                headers: { 'Authorization': token, 'Accept': 'application/json' }
            });

            if (!courseRes.data.schedule) {
                return res.status(404).json({ error: "Kursus tidak ditemukan atau belum punya jadwal." });
            }
            newCourse = courseRes.data; // (Simpan semua data course)

        } catch (err) {
             return res.status(500).json({ message: "Gagal menghubungi Course Service", error: err.message });
        }

        // Ambil semua course YANG SUDAH DIIKUTI student ini
        const [studentEnrollments] = await pool.query(
            "SELECT course_id FROM enrollments WHERE student_id = ?",
            [student_id]
        );

        // Cek jadwal bentrok (Looping)
        for (const row of studentEnrollments) {
            const currentCourseId = row.course_id;
            if (currentCourseId == course_id) continue;

            // Telepon Course Service LAGI untuk dapat jadwal KURSUS LAMA
            let currentCourseSchedule;
            try {
                const token = req.headers['authorization'];
                const courseRes = await axios.get(`${COURSE_SERVICE_URL}/course/${currentCourseId}`, {
                     headers: { 'Authorization': token, 'Accept': 'application/json' }
                });
                if (!courseRes.data.schedule) continue;
                currentCourseSchedule = courseRes.data.schedule;
            } catch (err) {
                continue; 
            }

            if (checkClash(currentCourseSchedule, newCourse.schedule)) {
                return res.status(409).json({
                    error: `Jadwal kursus bentrok dengan Course ID: ${currentCourseId}`
                });
            }
        }

        const [exists] = await pool.query(
            "SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?",
            [student_id, course_id]
        );

        if (exists.length > 0) {
            return res.status(409).json({ error: "Siswa sudah terdaftar dalam kursus ini" });
        }

        await pool.query(
            "INSERT INTO enrollments (student_id, course_id, teacher_id) VALUES (?, ?, ?)",
            [student_id, course_id, newCourse.teacher_id] 
        );

        res.status(201).json({ message: "Siswa berhasil didaftarkan ke kursus" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ✅ Test endpoint
app.get('/api', (req, res) => {
    res.json({ message: "Enrollment Service API is running!" });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
    console.log(`Enrollment Service running on port ${PORT}`);
});
