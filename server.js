const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'lifedrop_secret_key_12345';
const DB_PATH = process.env.VERCEL ? ':memory:' : path.join(__dirname, 'lifedrop.db');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    initializeDatabase();
  }
});

// Database Initialization
function initializeDatabase() {
  db.serialize(() => {
    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        blood_group TEXT NOT NULL,
        location TEXT NOT NULL,
        is_available INTEGER DEFAULT 1,
        role TEXT DEFAULT 'donor',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Emergency requests table
    db.run(`
      CREATE TABLE IF NOT EXISTS emergency_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_name TEXT NOT NULL,
        blood_group TEXT NOT NULL,
        hospital TEXT NOT NULL,
        location TEXT NOT NULL,
        contact TEXT NOT NULL,
        units INTEGER DEFAULT 1,
        urgency TEXT DEFAULT 'Medium',
        status TEXT DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Donations history table
    db.run(`
      CREATE TABLE IF NOT EXISTS donations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        donation_date TEXT NOT NULL,
        hospital TEXT NOT NULL,
        units INTEGER DEFAULT 1,
        status TEXT DEFAULT 'Completed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    // Seed data if users table is empty
    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
      if (err) {
        console.error('Error checking users count:', err);
        return;
      }

      if (row.count === 0) {
        console.log('Seeding database with initial donor profiles...');
        
        // Passwords for mock users (password: 'password123')
        const hashedPassword = bcrypt.hashSync('password123', 10);
        
        // Seed users (Ahmed, Sara, Rahim, Nusrat, Fahim, Mitu, Rakib, Admin)
        const mockUsers = [
          { name: 'Ahmed Khan', email: 'ahmed@gmail.com', phone: '01711111111', password: hashedPassword, blood_group: 'O+', location: 'Mirpur, Dhaka', role: 'donor', is_available: 1 },
          { name: 'Sara Islam', email: 'sara@gmail.com', phone: '01722222222', password: hashedPassword, blood_group: 'A+', location: 'Uttara, Dhaka', role: 'donor', is_available: 1 },
          { name: 'Rahim Mia', email: 'rahim@gmail.com', phone: '01733333333', password: hashedPassword, blood_group: 'O+', location: 'Dhanmondi, Dhaka', role: 'donor', is_available: 1 },
          { name: 'Nusrat Jahan', email: 'nusrat@gmail.com', phone: '01744444444', password: hashedPassword, blood_group: 'B+', location: 'Mohammadpur, Dhaka', role: 'donor', is_available: 1 },
          { name: 'Fahim Rahman', email: 'fahim@gmail.com', phone: '01755555555', password: hashedPassword, blood_group: 'O-', location: 'Banani, Dhaka', role: 'donor', is_available: 1 },
          { name: 'Mitu Akter', email: 'mitu@gmail.com', phone: '01766666666', password: hashedPassword, blood_group: 'AB+', location: 'Gulshan, Dhaka', role: 'donor', is_available: 1 },
          { name: 'Rakib Hasan', email: 'rakib@gmail.com', phone: '01710101010', password: hashedPassword, blood_group: 'O+', location: 'Mirpur, Dhaka', role: 'donor', is_available: 1 },
          { name: 'Admin User', email: 'admin@lifedrop.com', phone: '01700000000', password: bcrypt.hashSync('adminpassword', 10), blood_group: 'O+', location: 'Dhaka', role: 'admin', is_available: 0 }
        ];

        const stmt = db.prepare('INSERT INTO users (name, email, phone, password, blood_group, location, role, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        
        mockUsers.forEach(user => {
          stmt.run(user.name, user.email, user.phone, user.password, user.blood_group, user.location, user.role, user.is_available);
        });
        
        stmt.finalize((err) => {
          if (err) console.error('Error finalising users statement:', err);
          else {
            // Seed donation history for Rakib Hasan (id should be 7)
            db.run(`
              INSERT INTO donations (user_id, donation_date, hospital, units, status) VALUES 
              (7, '2026-03-12', 'City Hospital', 1, 'Completed'),
              (7, '2025-11-18', 'Apollo Hospital', 1, 'Completed'),
              (7, '2025-08-05', 'National Heart Foundation', 1, 'Completed')
            `, (err) => {
              if (err) console.error('Error seeding donations:', err);
            });

            // Seed some emergency requests
            db.run(`
              INSERT INTO emergency_requests (patient_name, blood_group, hospital, location, contact, units, urgency, status) VALUES
              ('Tanvir Ahmed', 'O+', 'City Hospital', 'Mirpur, Dhaka', '01777777777', 2, 'High', 'Pending'),
              ('Riya Das', 'A+', 'Square Hospital', 'Dhanmondi, Dhaka', '01788888888', 1, 'Medium', 'Matched'),
              ('Imran Hossain', 'B-', 'DMCH', 'Ramna, Dhaka', '01799999999', 3, 'High', 'Pending')
            `, (err) => {
              if (err) console.error('Error seeding requests:', err);
            });
            
            console.log('Database successfully seeded!');
          }
        });
      }
    });
  });
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = decoded;
    next();
  });
}

// ================= API ROUTES =================

// Register Route
app.post('/api/auth/register', (req, res) => {
  const { name, email, phone, password, blood_group, location } = req.body;

  if (!name || !email || !phone || !password || !blood_group || !location) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  // Check if user already exists
  db.get('SELECT id FROM users WHERE email = ? OR phone = ?', [email, phone], (err, row) => {
    if (err) return res.status(500).json({ message: 'Database error', error: err.message });
    if (row) return res.status(400).json({ message: 'Email or phone number already registered' });

    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run(
      'INSERT INTO users (name, email, phone, password, blood_group, location, role, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, email, phone, hashedPassword, blood_group, location, 'donor', 1],
      function (err) {
        if (err) return res.status(500).json({ message: 'Failed to create user', error: err.message });

        const token = jwt.sign({ id: this.lastID, email, role: 'donor' }, JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({
          message: 'User registered successfully',
          token,
          user: { id: this.lastID, name, email, phone, blood_group, location, role: 'donor', is_available: 1 }
        });
      }
    );
  });
});

// Login Route
app.post('/api/auth/login', (req, res) => {
  const { loginId, password } = req.body; // loginId can be email or phone

  if (!loginId || !password) {
    return res.status(400).json({ message: 'Credentials are required' });
  }

  db.get('SELECT * FROM users WHERE email = ? OR phone = ?', [loginId, loginId], (err, user) => {
    if (err) return res.status(500).json({ message: 'Database error', error: err.message });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isPasswordValid = bcrypt.compareSync(password, user.password);
    if (!isPasswordValid) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        blood_group: user.blood_group,
        location: user.location,
        role: user.role,
        is_available: user.is_available
      }
    });
  });
});

// Get Current User Profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  db.get('SELECT id, name, email, phone, blood_group, location, role, is_available FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ message: 'Database error', error: err.message });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  });
});

// Donors Route (with filtering)
app.get('/api/donors', (req, res) => {
  const { blood, location } = req.query;
  let query = "SELECT id, name, email, phone, blood_group as blood, location, is_available FROM users WHERE role = 'donor'";
  const params = [];

  if (blood) {
    query += " AND blood_group = ?";
    params.push(blood);
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch donors', error: err.message });

    // Client-side filtering check for partial match on location (similar to client's original design)
    let filtered = rows;
    if (location) {
      const locLower = location.toLowerCase();
      filtered = rows.filter(row => row.location.toLowerCase().includes(locLower));
    }

    // Add randomized distance to keep template feel or return mock distances
    const processed = filtered.map(row => {
      const initials = row.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      // Create a deterministic distance based on id to avoid jittering
      const distanceVal = (((row.id * 17) % 50) + 10) / 10;
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        blood: row.blood,
        location: row.location,
        distance: `${distanceVal.toFixed(1)} km`,
        initials,
        is_available: row.is_available
      };
    });

    res.json(processed);
  });
});

// Toggle Donor Availability
app.put('/api/donors/availability', authenticateToken, (req, res) => {
  const { is_available } = req.body;

  if (is_available === undefined) {
    return res.status(400).json({ message: 'is_available parameter is required' });
  }

  const statusVal = is_available ? 1 : 0;

  db.run('UPDATE users SET is_available = ? WHERE id = ?', [statusVal, req.user.id], function (err) {
    if (err) return res.status(500).json({ message: 'Failed to update availability', error: err.message });
    res.json({ message: 'Availability updated successfully', is_available: statusVal });
  });
});

// Submit Emergency Blood Request
app.post('/api/requests', (req, res) => {
  const { patient_name, blood_group, hospital, location, contact, units, urgency } = req.body;

  if (!patient_name || !blood_group || !hospital || !location || !contact) {
    return res.status(400).json({ message: 'All required fields must be filled' });
  }

  db.run(
    'INSERT INTO emergency_requests (patient_name, blood_group, hospital, location, contact, units, urgency, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [patient_name, blood_group, hospital, location, contact, units || 1, urgency || 'Medium', 'Pending'],
    function (err) {
      if (err) return res.status(500).json({ message: 'Failed to submit request', error: err.message });
      res.status(201).json({
        message: 'Emergency request submitted successfully',
        requestId: this.lastID
      });
    }
  );
});

// Get Emergency Requests
app.get('/api/requests', (req, res) => {
  db.all('SELECT * FROM emergency_requests ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch requests', error: err.message });
    res.json(rows);
  });
});

// Submit Donation Log
app.post('/api/donations', authenticateToken, (req, res) => {
  const { hospital, units } = req.body;
  const donation_date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  if (!hospital) {
    return res.status(400).json({ message: 'Hospital name is required' });
  }

  db.run(
    'INSERT INTO donations (user_id, donation_date, hospital, units, status) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, donation_date, hospital, units || 1, 'Completed'],
    function (err) {
      if (err) return res.status(500).json({ message: 'Failed to record donation', error: err.message });
      res.status(201).json({
        message: 'Donation recorded successfully',
        donationId: this.lastID,
        donation: { id: this.lastID, user_id: req.user.id, donation_date, hospital, units: units || 1, status: 'Completed' }
      });
    }
  );
});

// Get Current User's Donation History
app.get('/api/donations/history', authenticateToken, (req, res) => {
  db.all('SELECT * FROM donations WHERE user_id = ? ORDER BY donation_date DESC', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Failed to fetch donations history', error: err.message });
    res.json(rows);
  });
});

// Get Admin and System Statistics
app.get('/api/stats', (req, res) => {
  // Aggregate stats across tables
  const stats = {
    totalDonors: 1245, // Base counts to keep it look populated, plus real database items
    availableUnits: 234,
    pendingRequests: 18,
    successfulDonations: 846,
    stock: {
      'O+': 72,
      'A+': 58,
      'B+': 41,
      'AB+': 23
    }
  };

  db.get("SELECT COUNT(*) as count FROM users WHERE role = 'donor'", (err, rDonors) => {
    if (!err && rDonors) {
      stats.totalDonors = rDonors.count + 1200; // Adding offset to look like a mature platform
    }
    
    db.get("SELECT COUNT(*) as count FROM emergency_requests WHERE status = 'Pending'", (err, rRequests) => {
      if (!err && rRequests) {
        stats.pendingRequests = rRequests.count + 15;
      }

      db.get("SELECT COUNT(*) as count FROM donations WHERE status = 'Completed'", (err, rDonations) => {
        if (!err && rDonations) {
          stats.successfulDonations = rDonations.count + 840;
          // Calculate dynamic available units based on total donations
          stats.availableUnits = rDonations.count + 230;
        }

        // Return stats
        res.json(stats);
      });
    });
  });
});

// Serve frontend for any other routes (HTML5 Routing support if needed)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server (only if not running as a serverless function on Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

// Export app for Vercel serverless deployment
module.exports = app;