const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();

const AUTH_SERVICE_URL =
  process.env.API_GATEWAY_URL || "http://localhost:3000/api";

const checkAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (token == null) {
      return res
        .status(401)
        .json({ message: "Akses ditolak: Token tidak ada." });
    }

    const authResponse = await axios.get(`${AUTH_SERVICE_URL}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (authResponse.status === 200 && authResponse.data.status === "success") {
      req.user = authResponse.data.data;
      next();
    } else {
      res
        .status(401)
        .json({ message: authResponse.data.message || "Token tidak valid." });
    }
  } catch (error) {
    if (error.response && error.response.status === 401) {
      return res
        .status(401)
        .json({ message: "Token tidak valid atau kadaluwarsa." });
    }
    console.error("Auth Middleware Error:", error.message);
    res.status(500).json({ message: "Gagal menghubungi service otentikasi." });
  }
};

module.exports = {
  checkAuth: checkAuth,
};
