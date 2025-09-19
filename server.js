const express = require('express');
const QRCode = require('qrcode');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const bcrypt = require('bcrypt');
const cors = require('cors'); // Added for mobile data access
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000; // Render.com assigns PORT
const dataFile = path.join(__dirname, 'assets.json');

// Admin credentials from environment variables
const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password';

// Load assets from file
async function loadAssets() {
  try {
    const data = await fs.readFile(dataFile, 'utf8');
    return new Map(JSON.parse(data));
  } catch (error) {
    console.log('No existing assets file found, starting fresh.');
    return new Map();
  }
}

// Save assets to file
async function saveAssets(assets) {
  try {
    const data = JSON.stringify([...assets], null, 2);
    await fs.writeFile(dataFile, data);
    console.log('Assets saved to file.');
  } catch (error) {
    console.error('Error saving assets:', error);
  }
}

// Load assets on startup
let assets;
loadAssets().then(loadedAssets => {
  assets = loadedAssets;
  console.log(`Loaded ${assets.size} assets from storage:`, [...assets.keys()]);
});

// Middleware
app.use(cors()); // Enable CORS for mobile data access
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple session management using memory (not persistent)
const sessions = new Map();

// Middleware to check if user is authenticated
function isAuthenticated(req) {
  const sessionId = req.headers.cookie ? req.headers.cookie.split('sessionId=')[1]?.split(';')[0] : null;
  console.log(`Checking authentication: sessionId=${sessionId}, exists=${sessions.has(sessionId)}`);
  return sessionId && sessions.has(sessionId);
}

// Helper function to generate session ID
function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Get base URL for QR codes (Render.com or local)
function getNetworkIP() {
  if (process.env.BASE_URL) {
    console.log(`Using BASE_URL from .env: ${process.env.BASE_URL}`);
    return process.env.BASE_URL;
  }
  // Fallback for local development
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const url = `http://${iface.address}:${port}`;
        console.log(`Detected local IP: ${url}`);
        return url;
      }
    }
  }
  console.log(`Falling back to localhost: http://localhost:${port}`);
  return `http://localhost:${port}`;
}

// Login page
app.get('/', (req, res) => {
  const baseUrl = getNetworkIP();
  if (isAuthenticated(req)) {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Asset QR Code Generator</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="manifest" href="/manifest.json">
        <meta name="theme-color" content="#1e3a8a">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
        <link rel="apple-touch-icon" href="/icon-192.png">
        <script>
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
              .then(reg => console.log('Service Worker registered'))
              .catch(err => console.error('Service Worker registration failed:', err));
          }
        </script>
        <style>
          .gradient-bg {
            background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
          }
          .input-focus {
            transition: all 0.2s ease-in-out;
          }
          .input-focus:focus {
            transform: scale(1.01);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
          }
        </style>
      </head>
      <body class="gradient-bg min-h-screen flex items-center justify-center py-12">
        <div class="container mx-auto max-w-2xl bg-white p-10 rounded-2xl shadow-2xl">
          <h1 class="text-3xl font-bold text-gray-900 mb-8">Asset QR Code Generator</h1>
          
          <div class="bg-white border border-gray-200 p-6 rounded-lg mb-6 shadow-sm">
            <h3 class="text-lg font-semibold text-gray-800 mb-3">Network Access</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <p class="text-sm text-gray-600"><strong>Desktop:</strong> <span class="font-mono bg-gray-100 p-1 rounded">${baseUrl}</span></p>
            </div>
            <p class="text-xs text-gray-500 mt-3">Install as an app for easier access!</p>
          </div>

          <div class="bg-blue-50 p-4 rounded-lg mb-6">
            <h4 class="text-md font-semibold text-blue-800 mb-2">Install as App</h4>
            <p class="text-sm text-gray-600">On mobile, tap your browser's menu and select "Add to Home Screen". On desktop, click the "+" in the address bar.</p>
          </div>
          
          <div class="text-center text-gray-600 mb-6 bg-gray-50 py-3 rounded-lg">
            <p>Total Assets Stored: <span class="font-semibold text-blue-600">${assets.size}</span></p>
          </div>
          
          <form action="/generate" method="POST" class="space-y-6">
            <h3 class="text-xl font-semibold text-gray-800">Create New Asset</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label for="id" class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" id="id" name="id" placeholder="Enter name" required class="input-focus w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-gray-50">
              </div>
              <div>
                <label for="name" class="block text-sm font-medium text-gray-700 mb-1">Asset ID</label>
                <input type="text" id="name" name="name" placeholder="Enter unique asset ID" required class="input-focus w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-gray-50">
              </div>
              <div>
                <label for="location" class="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input type="text" id="location" name="location" placeholder="e.g., Office Room 101" required class="input-focus w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-gray-50">
              </div>
              <div>
                <label for="department" class="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <input type="text" id="department" name="department" placeholder="Enter department" class="input-focus w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-gray-50">
              </div>
              <div>
                <label for="desktopSetupDate" class="block text-sm font-medium text-gray-700 mb-1">Setup Date (Optional)</label>
                <input type="date" id="desktopSetupDate" name="desktopSetupDate" class="input-focus w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-gray-50">
              </div>
              <div>
                <label for="assetPassword" class="block text-sm font-medium text-gray-700 mb-1">Asset Password</label>
                <input type="password" id="assetPassword" name="assetPassword" placeholder="Set a password" required class="input-focus w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-gray-50">
              </div>
            </div>
            <button type="submit" class="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold shadow-md">Generate QR Code</button>
          </form>
          
          <div class="mt-6 flex justify-center space-x-6 text-sm">
            <a href="/list" class="text-blue-600 hover:underline font-medium">View All Assets</a>
            <a href="/qr/all" class="text-purple-600 hover:underline font-medium">View All QR Codes</a>
            <a href="/scan" class="text-green-600 hover:underline font-medium">Scan QR Code</a>
            <a href="/logout" class="text-red-600 hover:underline font-medium">Logout</a>
          </div>
        </div>
      </body>
      </html>
    `);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin Login</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="manifest" href="/manifest.json">
        <meta name="theme-color" content="#1e3a8a">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
        <link rel="apple-touch-icon" href="/icon-192.png">
        <script>
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
              .then(reg => console.log('Service Worker registered'))
              .catch(err => console.error('Service Worker registration failed:', err));
          }
        </script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="container mx-auto max-w-md bg-white p-8 rounded-2xl shadow-lg">
          <h1 class="text-3xl font-bold text-gray-800 text-center mb-6">Admin Login</h1>
          <form action="/login" method="POST" class="space-y-4">
            <div>
              <input type="text" name="id" placeholder="Admin ID" required class="block w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500">
            </div>
            <div>
              <input type="password" name="password" placeholder="Password" required class="block w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500">
            </div>
            <button type="submit" class="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Login</button>
          </form>
          <p class="text-sm text-gray-600 mt-4 text-center">Install this app from your browser for quick access!</p>
        </div>
      </body>
      </html>
    `);
  }
});

// Handle login
app.post('/login', (req, res) => {
  const { id, password } = req.body;
  console.log(`Login attempt: id=${id}`);
  if (id === ADMIN_ID && password === ADMIN_PASSWORD) {
    const sessionId = generateSessionId();
    sessions.set(sessionId, { authenticated: true });
    res.setHeader('Set-Cookie', `sessionId=${sessionId}; HttpOnly; Path=/`);
    res.redirect('/');
  } else {
    console.log(`Login failed for id=${id}`);
    res.status(401).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login Failed</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="container mx-auto max-w-md bg-white p-8 rounded-2xl shadow-lg">
          <h1 class="text-3xl font-bold text-red-600 text-center mb-6">Login Failed</h1>
          <p class="text-gray-600 text-center mb-4">Invalid ID or password.</p>
          <a href="/" class="text-blue-600 hover:underline text-center">Try Again</a>
        </div>
      </body>
      </html>
    `);
  }
});

// Handle logout
app.get('/logout', (req, res) => {
  const sessionId = req.headers.cookie ? req.headers.cookie.split('sessionId=')[1]?.split(';')[0] : null;
  if (sessionId) {
    console.log(`Logging out session: ${sessionId}`);
    sessions.delete(sessionId);
  }
  res.setHeader('Set-Cookie', 'sessionId=; Max-Age=0; HttpOnly; Path=/');
  res.redirect('/');
});

// Generate QR codes for all assets
app.get('/qr/all', async (req, res) => {
  if (!isAuthenticated(req)) {
    console.log('Access to /qr/all denied: Not authenticated');
    res.redirect('/');
    return;
  }

  const baseUrl = getNetworkIP();
  let qrCodesHtml = '';

  if (assets.size === 0) {
    qrCodesHtml = `
      <div class="text-center bg-white p-8 rounded-lg shadow">
        <h2 class="text-2xl font-bold text-gray-600 mb-4">No Assets Found</h2>
        <p class="text-gray-500 mb-4">Create some assets to generate QR codes.</p>
        <a href="/" class="text-blue-600 hover:underline">Back to Home</a>
      </div>
    `;
  } else {
    for (const [id, asset] of assets) {
      try {
        const url = `${baseUrl}/asset/${asset.name}?scan=true`;
        console.log(`Generating QR code for asset: ${id}, URL: ${url}`);
        const qrDataUrl = await QRCode.toDataURL(url, {
          width: 200,
          margin: 2,
          color: { dark: '#000000', light: '#FFFFFF' },
          errorCorrectionLevel: 'H'
        });
        qrCodesHtml += `
          <div class="bg-white p-6 rounded-lg shadow-md">
            <h3 class="text-lg font-semibold text-gray-800 mb-2">${asset.name}</h3>
            <p class="text-sm text-gray-600 mb-4">ID: ${asset.id} | Location: ${asset.location}</p>
            <img src="${qrDataUrl}" alt="QR Code for ${asset.name}" class="mx-auto mb-4 border-2 border-gray-200 rounded-lg">
            <div class="flex justify-center space-x-4">
              <a href="${baseUrl}/qr/${asset.name}/download" class="py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">Download QR</a>
              <a href="${baseUrl}/asset/${asset.name}" class="py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">View Asset</a>
            </div>
          </div>
        `;
      } catch (err) {
        console.error(`Error generating QR code for asset ID ${id}:`, err);
        qrCodesHtml += `
          <div class="bg-white p-6 rounded-lg shadow-md">
            <h3 class="text-lg font-semibold text-gray-800 mb-2">${asset.name}</h3>
            <p class="text-sm text-red-600 mb-4">Error generating QR code</p>
            <div class="flex justify-center space-x-4">
              <a href="${baseUrl}/asset/${asset.name}" class="py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">View Asset</a>
            </div>
          </div>
        `;
      }
    }
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>All Asset QR Codes</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link rel="manifest" href="/manifest.json">
      <meta name="theme-color" content="#1e3a8a">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
      <link rel="apple-touch-icon" href="/icon-192.png">
      <script>
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js');
        }
      </script>
      <style>
        .gradient-bg {
          background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
        }
      </style>
    </head>
    <body class="gradient-bg min-h-screen py-12">
      <div class="container mx-auto max-w-5xl p-6">
        <h1 class="text-3xl font-bold text-white mb-8 text-center">All Asset QR Codes (${assets.size})</h1>
        <div class="flex justify-between mb-6">
          <a href="/" class="text-white hover:underline">← Back to Generator</a>
          <div class="space-x-4">
            <a href="/list" class="text-white hover:underline">View All Assets</a>
            <a href="/scan" class="text-white hover:underline">Scan QR Code</a>
            <a href="/logout" class="text-red-300 hover:underline">Logout</a>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          ${qrCodesHtml}
        </div>
      </div>
    </body>
    </html>
  `);
});

// List all assets (admin only)
app.get('/list', (req, res) => {
  if (!isAuthenticated(req)) {
    console.log('Access to /list denied: Not authenticated');
    res.redirect('/');
    return;
  }
  const baseUrl = getNetworkIP();
  let assetList = '';
  for (const [id, asset] of assets) {
    const scans = asset.scanHistory ? asset.scanHistory.length : 0;
    assetList += `
      <tr class="bg-white even:bg-gray-50">
        <td class="px-4 py-3">${asset.id}</td>
        <td class="px-4 py-3">${asset.name}</td>
        <td class="px-4 py-3">${asset.location}</td>
        <td class="px-4 py-3">******** <a href="${baseUrl}/change-password/${id}" class="text-blue-600 hover:underline">(Change)</a></td>
        <td class="px-4 py-3">${scans}</td>
        <td class="px-4 py-3 space-x-2">
          <a href="${baseUrl}/asset/${id}" class="text-blue-600 hover:underline">View</a>
          <a href="${baseUrl}/qr/${id}" class="text-green-600 hover:underline">QR</a>
          <a href="${baseUrl}/delete/${id}" onclick="return confirm('Are you sure you want to delete ${asset.name}?')" class="text-red-600 hover:underline">Delete</a>
        </td>
      </tr>
    `;
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>All Assets</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link rel="manifest" href="/manifest.json">
      <meta name="theme-color" content="#1e3a8a">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
      <link rel="apple-touch-icon" href="/icon-192.png">
      <script>
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js');
        }
      </script>
    </head>
    <body class="bg-gray-100 min-h-screen">
      <div class="container mx-auto max-w-5xl p-6">
        <h1 class="text-3xl font-bold text-gray-800 mb-6">All Assets (${assets.size})</h1>
        <div class="flex justify-between mb-4">
          <a href="/" class="text-blue-600 hover:underline">← Back to Generator</a>
          <div class="space-x-4">
            <a href="${baseUrl}/qr/all" class="text-purple-600 hover:underline">View All QR Codes</a>
            <a href="${baseUrl}/scan" class="text-green-600 hover:underline">Scan QR Code</a>
            <a href="/logout" class="text-red-600 hover:underline">Logout</a>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full bg-white rounded-lg shadow">
            <thead>
              <tr class="bg-gray-200 text-gray-600 uppercase text-sm">
                <th class="px-4 py-3 text-left">Name</th>
                <th class="px-4 py-3 text-left">Asset ID</th>
                <th class="px-4 py-3 text-left">Location</th>
                <th class="px-4 py-3 text-left">Password</th>
                <th class="px-4 py-3 text-left">Scans</th>
                <th class="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${assetList || '<tr><td colspan="6" class="text-center py-4">No assets found</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Change asset password (admin only)
app.get('/change-password/:id', (req, res) => {
  if (!isAuthenticated(req)) {
    console.log('Access to /change-password/:id denied: Not authenticated');
    res.redirect('/');
    return;
  }
  const asset = assets.get(req.params.id);
  if (!asset) {
    console.log(`Change password failed: Asset ID ${req.params.id} not found`);
    res.status(404).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Asset Not Found</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="text-center bg-white p-8 rounded-2xl shadow-lg">
          <h2 class="text-2xl font-bold text-red-600 mb-4">Asset not found</h2>
          <a href="/list" class="text-blue-600 hover:underline">Back to Asset List</a>
        </div>
      </body>
      </html>
    `);
    return;
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Change Password for ${asset.name}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link rel="manifest" href="/manifest.json">
      <meta name="theme-color" content="#1e3a8a">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
      <link rel="apple-touch-icon" href="/icon-192.png">
      <script>
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js');
        }
      </script>
    </head>
    <body class="bg-gray-100 min-h-screen flex items-center justify-center">
      <div class="container mx-auto max-w-md bg-white p-8 rounded-2xl shadow-lg">
        <h1 class="text-2xl font-bold text-gray-800 mb-6">Change Password for ${asset.name}</h1>
        <form action="/change-password/${req.params.id}" method="POST" class="space-y-4">
          <div>
            <label for="newPassword" class="block text-sm font-medium text-gray-700">New Asset Password</label>
            <input type="password" id="newPassword" name="newPassword" placeholder="Enter new password" required class="mt-1 block w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500">
          </div>
          <button type="submit" class="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Update Password</button>
        </form>
        <a href="/list" class="block mt-4 text-blue-600 hover:underline text-center">Back to Asset List</a>
      </div>
    </body>
    </html>
  `);
});

// Handle password change (admin only)
app.post('/change-password/:id', async (req, res) => {
  if (!isAuthenticated(req)) {
    console.log('Change password POST denied: Not authenticated');
    res.redirect('/');
    return;
  }
  const asset = assets.get(req.params.id);
  if (!asset) {
    console.log(`Change password failed: Asset ID ${req.params.id} not found`);
    res.status(404).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Asset Not Found</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="text-center bg-white p-8 rounded-2xl shadow-lg">
          <h2 class="text-2xl font-bold text-red-600 mb-4">Asset not found</h2>
          <a href="/list" class="text-blue-600 hover:underline">Back to Asset List</a>
        </div>
      </body>
      </html>
    `);
    return;
  }

  const { newPassword } = req.body;
  if (!newPassword) {
    console.log(`Change password failed for ${req.params.id}: No new password provided`);
    res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="text-center bg-white p-8 rounded-2xl shadow-lg">
          <h2 class="text-2xl font-bold text-red-600 mb-4">Error: New password is required</h2>
          <a href="/change-password/${req.params.id}" class="text-blue-600 hover:underline">Try Again</a>
        </div>
      </body>
      </html>
    `);
    return;
  }

  try {
    asset.assetPassword = await bcrypt.hash(newPassword, 10);
    await saveAssets(assets);
    console.log(`Password updated for asset ID: ${req.params.id}`);
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Updated</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="text-center bg-white p-8 rounded-2xl shadow-lg">
          <h2 class="text-2xl font-bold text-green-600 mb-4">Password for ${asset.name} updated successfully</h2>
          <a href="/list" class="text-blue-600 hover:underline">Back to Asset List</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error(`Error updating password for asset ID ${req.params.id}:`, error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="text-center bg-white p-8 rounded-2xl shadow-lg">
          <h2 class="text-2xl font-bold text-red-600 mb-4">Error updating password</h2>
          <a href="/list" class="text-blue-600 hover:underline">Back to Asset List</a>
        </div>
      </body>
      </html>
    `);
  }
});

// Generate QR code and store details
app.post('/generate', async (req, res) => {
  if (!isAuthenticated(req)) {
    console.log('Access to /generate denied: Not authenticated');
    res.redirect('/');
    return;
  }
  const { id, name, location, department, desktopSetupDate, assetPassword } = req.body;
  console.log(`Generating asset: id=${id}, name=${name}, location=${location}`);
  if (!id || !name || !location || !assetPassword) {
    console.log('Asset creation failed: Missing required fields');
    res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="text-center bg-white p-8 rounded-2xl shadow-lg">
          <h2 class="text-2xl font-bold text-red-600 mb-4">Error: Name, Asset ID, Location, and Asset Password are required</h2>
          <a href="/" class="text-blue-600 hover:underline">Try Again</a>
        </div>
      </body>
      </html>
    `);
    return;
  }

  if (assets.has(name)) {
    const baseUrl = getNetworkIP();
    console.log(`Asset creation failed: Asset ID ${name} already exists`);
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="text-center bg-white p-8 rounded-2xl shadow-lg">
          <h2 class="text-2xl font-bold text-red-600 mb-4">Asset ID already exists!</h2>
          <div class="space-x-4">
            <a href="${baseUrl}/asset/${name}" class="text-blue-600 hover:underline">View existing asset</a>
            <a href="/" class="text-blue-600 hover:underline">Try different ID</a>
          </div>
        </div>
      </body>
      </html>
    `);
    return;
  }

  const asset = {
    id,
    name,
    location,
    department: department || '',
    desktopSetupDate: desktopSetupDate || '',
    assetPassword: await bcrypt.hash(assetPassword, 10),
    scanHistory: []
  };
  assets.set(name, asset);
  await saveAssets(assets);
  console.log(`Asset created: ${name}, Current assets:`, [...assets.keys()]);

  const baseUrl = getNetworkIP();
  const url = `${baseUrl}/asset/${name}?scan=true`;

  QRCode.toDataURL(url, { 
    width: 300,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
    errorCorrectionLevel: 'H'
  }, (err, qrDataUrl) => {
    if (err) {
      console.error(`QR code generation failed for asset ${name}:`, err);
      res.status(500).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Error</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-100 min-h-screen flex items-center justify-center">
          <div class="text-center bg-white p-8 rounded-2xl shadow-lg">
            <h2 class="text-2xl font-bold text-red-600 mb-4">Error generating QR code</h2>
            <a href="/" class="text-blue-600 hover:underline">Try Again</a>
          </div>
        </body>
        </html>
      `);
      return;
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>QR Code Generated - ${name}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="manifest" href="/manifest.json">
        <meta name="theme-color" content="#1e3a8a">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
        <link rel="apple-touch-icon" href="/icon-192.png">
        <script>
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js');
          }
        </script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="container mx-auto max-w-md bg-white p-8 rounded-2xl shadow-lg">
          <h1 class="text-2xl font-bold text-gray-800 text-center mb-4">Asset QR Code Ready!</h1>
          <h3 class="text-lg font-semibold text-gray-700 text-center mb-4">${name}</h3>
          <p class="text-gray-600 text-center mb-4">Scan this QR code to view details.</p>
          
          <div class="bg-blue-50 p-3 rounded-lg mb-4">
            <p class="font-mono text-sm text-gray-600">QR URL: ${url}</p>
          </div>
          
          <img src="${qrDataUrl}" alt="Asset QR Code" class="mx-auto mb-4 border-2 border-gray-200 rounded-lg">
          
          <div class="flex flex-col space-y-2">
            <a href="${baseUrl}/qr/${name}/download" class="py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 text-center">Download QR Code</a>
            <a href="${baseUrl}/asset/${name}" class="py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-center">🔗 Open in Browser</a>
            <a href="/" class="py-2 px-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-center">➕ Add Another Asset</a>
            <a href="/list" class="py-2 px-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-center">📋 View All Assets</a>
            <a href="/qr/all" class="py-2 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-center">🖼 View All QR Codes</a>
          </div>
          
          <p class="text-sm text-gray-500 mt-4 text-center">💡 Right-click or long-press the QR code to save/print</p>
        </div>
      </body>
      </html>
    `);
  });
});

// Generate QR for existing asset
app.get('/qr/:id', async (req, res) => {
  const asset = assets.get(req.params.id);
  if (!asset) {
    console.log(`QR generation failed: Asset ID ${req.params.id} not found`);
    res.status(404).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Asset Not Found</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="text-center bg-white p-8 rounded-2xl shadow-lg">
          <h2 class="text-2xl font-bold text-red-600 mb-4">Asset not found</h2>
          <p class="text-gray-600 mb-4">The asset ID "${req.params.id}" does not exist.</p>
          <a href="/" class="text-blue-600 hover:underline">Back to Home</a>
        </div>
      </body>
      </html>
    `);
    return;
  }

  const baseUrl = getNetworkIP();
  const url = `${baseUrl}/asset/${asset.name}?scan=true`;
  
  try {
    console.log(`Generating QR for asset: ${asset.name}, URL: ${url}`);
    const qrDataUrl = await QRCode.toDataURL(url, { 
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'H'
    });
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>QR Code for ${asset.name}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="manifest" href="/manifest.json">
        <meta name="theme-color" content="#1e3a8a">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
        <link rel="apple-touch-icon" href="/icon-192.png">
        <script>
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js');
          }
        </script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="container mx-auto max-w-md bg-white p-8 rounded-2xl shadow-lg">
          <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">QR Code for ${asset.name}</h2>
          <img src="${qrDataUrl}" alt="Asset QR Code" class="mx-auto mb-4 border-2 border-gray-200 rounded-lg">
          <div class="flex flex-col space-y-2">
            <a href="${baseUrl}/qr/${asset.name}/download" class="py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 text-center">Download QR Code</a>
            <a href="${baseUrl}/qr/all" class="py-2 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-center">View All QR Codes</a>
            <a href="/" class="py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-center">← Back to Home</a>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(`QR generation error for asset ID ${req.params.id}:`, err);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="text-center bg-white p-8 rounded-2xl shadow-lg">
          <h2 class="text-2xl font-bold text-red-600 mb-4">Error generating QR code</h2>
          <a href="/" class="text-blue-600 hover:underline">Back to Home</a>
        </div>
      </body>
      </html>
    `);
  }
});

// Download QR code as PNG
app.get('/qr/:id/download', async (req, res) => {
  const asset = assets.get(req.params.id);
  if (!asset) {
    console.log(`QR download failed: Asset ID ${req.params.id} not found`);
    res.status(404).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Asset Not Found</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="text-center bg-white p-8 rounded-2xl shadow-lg">
          <h2 class="text-2xl font-bold text-red-600 mb-4">Asset not found</h2>
          <p class="text-gray-600 mb-4">The asset ID "${req.params.id}" does not exist.</p>
          <a href="/" class="text-blue-600 hover:underline">Back to Home</a>
        </div>
      </body>
      </html>
    `);
    return;
  }

  const baseUrl = getNetworkIP();
  const url = `${baseUrl}/asset/${asset.name}?scan=true`;
  try {
    console.log(`Downloading QR for asset: ${asset.name}, URL: ${url}`);
    const qrBuffer = await QRCode.toBuffer(url, { width: 300, margin: 2 });
    res.setHeader('Content-Disposition', `attachment; filename=qr-${asset.name}.png`);
    res.type('image/png').send(qrBuffer);
  } catch (err) {
    console.error(`QR download error for asset ID ${req.params.id}:`, err);
    res.status(500).send('Error generating QR code');
  }
});

// Delete asset (admin only)
app.get('/delete/:id', async (req, res) => {
  console.log(`Delete request received for asset ID: ${req.params.id}, Cookies: ${req.headers.cookie}`);
  if (!isAuthenticated(req)) {
    console.log('Delete failed: Not authenticated');
    res.redirect('/');
    return;
  }
  const asset = assets.get(req.params.id);
  if (!asset) {
    console.log(`Delete failed: Asset ID ${req.params.id} not found. Available assets:`, [...assets.keys()]);
    res.status(404).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Asset Not Found</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="text-center bg-white p-8 rounded-2xl shadow-lg">
          <h2 class="text-2xl font-bold text-red-600 mb-4">Asset not found</h2>
          <p class="text-gray-600 mb-4">The asset ID "${req.params.id}" does not exist.</p>
          <p class="text-gray-500 text-sm mb-4">Available asset IDs: ${[...assets.keys()].join(', ') || 'None'}</p>
          <a href="/list" class="text-blue-600 hover:underline">Back to Asset List</a>
        </div>
      </body>
      </html>
    `);
    return;
  }

  try {
    assets.delete(req.params.id);
    await saveAssets(assets);
    console.log(`Successfully deleted asset ID: ${req.params.id}, Remaining assets:`, [...assets.keys()]);
    res.redirect('/list');
  } catch (error) {
    console.error(`Delete error for asset ID ${req.params.id}:`, error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="text-center bg-white p-8 rounded-2xl shadow-lg">
          <h2 class="text-2xl font-bold text-red-600 mb-4">Error deleting asset</h2>
          <p class="text-gray-600 mb-4">Please try again or check server logs.</p>
          <a href="/list" class="text-blue-600 hover:underline">Back to Asset List</a>
        </div>
      </body>
      </html>
    `);
  }
});

// Browser-based QR code scanning
app.get('/scan', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Scan QR Code</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://unpkg.com/jsqr/dist/jsQR.js"></script>
      <link rel="manifest" href="/manifest.json">
      <meta name="theme-color" content="#1e3a8a">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
      <link rel="apple-touch-icon" href="/icon-192.png">
      <script>
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js');
        }
      </script>
    </head>
    <body class="bg-gray-100 min-h-screen flex items-center justify-center">
      <div class="container mx-auto max-w-md bg-white p-8 rounded-2xl shadow-lg">
        <h1 class="text-2xl font-bold text-gray-800 mb-4 text-center">Scan QR Code</h1>
        <video id="video" width="100%" autoplay></video>
        <canvas id="canvas" style="display:none;"></canvas>
        <p id="output" class="text-center text-gray-600 mt-4">Scanning...</p>
        <a href="/" class="block mt-4 text-blue-600 hover:underline text-center">Back to Home</a>
        <script>
          const video = document.getElementById('video');
          const canvas = document.getElementById('canvas');
          const ctx = canvas.getContext('2d');
          const output = document.getElementById('output');

          navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(stream => {
              video.srcObject = stream;
              video.play();
              scan();
            })
            .catch(err => {
              output.textContent = 'Camera access denied. Please allow camera permissions.';
              output.classList.add('text-red-600');
              console.error('Camera access error:', err);
            });

          function scan() {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code) {
              console.log('Scanned QR code URL:', code.data);
              const url = new URL(code.data);
              const assetId = url.pathname.split('/asset/')[1]?.split('?')[0];
              if (!assetId) {
                output.textContent = 'Invalid QR code: No asset ID found';
                output.classList.add('text-red-600');
                setTimeout(() => requestAnimationFrame(scan), 1000);
                return;
              }
              window.location.href = code.data;
            } else {
              requestAnimationFrame(scan);
            }
          }
        </script>
      </div>
    </body>
    </html>
  `);
});

// Handle asset password verification
app.post('/asset/verify/:id', async (req, res) => {
  const { password } = req.body;
  const asset = assets.get(req.params.id);
  if (!asset) {
    console.log(`Asset verification failed: Asset ID ${req.params.id} not found`);
    res.status(404).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Asset Not Found</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="text-center bg-white p-8 rounded-2xl shadow-lg">
          <h2 class="text-2xl font-bold text-red-600 mb-4">Asset not found</h2>
          <p class="text-gray-600 mb-4">The asset ID "${req.params.id}" does not exist.</p>
          <a href="/" class="text-blue-600 hover:underline">Back to Home</a>
        </div>
      </body>
      </html>
    `);
    return;
  }

  if (await bcrypt.compare(password, asset.assetPassword)) {
    console.log(`Asset ${req.params.id} verified successfully`);
    const sessionId = generateSessionId();
    sessions.set(sessionId, { assetId: req.params.id, verified: true });
    res.setHeader('Set-Cookie', `assetSessionId=${sessionId}; HttpOnly; Path=/asset/${req.params.id}`);
    res.redirect(`/asset/${req.params.id}?scan=true`);
  } else {
    console.log(`Asset verification failed for ${req.params.id}: Incorrect password`);
    res.status(401).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Access Denied</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="container mx-auto max-w-md bg-white p-8 rounded-2xl shadow-lg">
          <h1 class="text-2xl font-bold text-gray-800 mb-4 text-center">Access Denied</h1>
          <p class="text-red-600 font-semibold mb-4">Incorrect password. Please try again.</p>
          <form action="/asset/verify/${req.params.id}" method="POST" class="space-y-4">
            <input type="password" name="password" placeholder="Enter Asset Password" required class="block w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500">
            <button type="submit" class="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Submit</button>
          </form>
          <a href="/" class="block mt-4 text-blue-600 hover:underline text-center">Back to Home</a>
        </div>
      </body>
      </html>
    `);
  }
});

// Display asset details (mobile-friendly)
app.get('/asset/:id', async (req, res) => {
  console.log(`Accessing asset with ID: ${req.params.id}, Query: ${JSON.stringify(req.query)}, Cookies: ${req.headers.cookie}`);
  const asset = assets.get(req.params.id);
  if (!asset) {
    console.log(`Asset not found for ID: ${req.params.id}. Available assets:`, [...assets.keys()]);
    res.status(404).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Asset Not Found</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="text-center bg-white p-8 rounded-2xl shadow-lg">
          <h2 class="text-2xl font-bold text-red-600 mb-4">Asset Not Found</h2>
          <p class="text-gray-600 mb-4">The asset ID "${req.params.id}" does not exist.</p>
          <p class="text-gray-500 text-sm mb-4">Available asset IDs: ${[...assets.keys()].join(', ') || 'None'}</p>
          <a href="/" class="text-blue-600 hover:underline">← Back to Home</a>
        </div>
      </body>
      </html>
    `);
    return;
  }

  const isAdmin = isAuthenticated(req);
  const assetSessionId = req.headers.cookie ? req.headers.cookie.split('assetSessionId=')[1]?.split(';')[0] : null;
  const isVerified = assetSessionId && sessions.has(assetSessionId) && sessions.get(assetSessionId).assetId === req.params.id;

  if (req.query.scan === 'true' && !isAdmin && !isVerified) {
    console.log(`Asset ${req.params.id} requires password verification`);
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Enter Asset Password</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="container mx-auto max-w-md bg-white p-8 rounded-2xl shadow-lg">
          <h1 class="text-2xl font-bold text-gray-800 mb-4 text-center">Asset Access</h1>
          <p class="text-gray-600 mb-4 text-center">Please enter the password to view details for ${asset.name}.</p>
          <form action="/asset/verify/${req.params.id}" method="POST" class="space-y-4">
            <input type="password" name="password" placeholder="Enter Asset Password" required class="block w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500">
            <button type="submit" class="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Submit</button>
          </form>
          <a href="/" class="block mt-4 text-blue-600 hover:underline text-center">Back to Home</a>
        </div>
      </body>
      </html>
    `);
    return;
  }

  if (req.query.scan === 'true') {
    if (!asset.scanHistory) asset.scanHistory = [];
    const now = new Date().toISOString();
    const userAgent = req.headers['user-agent'] || 'Unknown Device';
    asset.scanHistory.push({ timestamp: now, device: userAgent });
    await saveAssets(assets);
    console.log(`Recorded scan for asset ${req.params.id}: ${now}, Device: ${userAgent}`);
  }

  const scans = asset.scanHistory ? asset.scanHistory.length : 0;
  let scanHistoryHtml = '';
  if (asset.scanHistory && asset.scanHistory.length > 0) {
    scanHistoryHtml = `
      <div class="mt-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-3">Scan History</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full bg-white rounded-lg shadow">
            <thead>
              <tr class="bg-gray-200 text-gray-600 uppercase text-sm">
                <th class="px-4 py-3 text-left">Timestamp</th>
                <th class="px-4 py-3 text-left">Device</th>
              </tr>
            </thead>
            <tbody>
              ${asset.scanHistory.map(scan => `
                <tr class="bg-white even:bg-gray-50">
                  <td class="px-4 py-3">${new Date(scan.timestamp).toLocaleString()}</td>
                  <td class="px-4 py-3">${scan.device}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${asset.name} - Asset Details</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link rel="manifest" href="/manifest.json">
      <meta name="theme-color" content="#1e3a8a">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
      <link rel="apple-touch-icon" href="/icon-192.png">
      <script>
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js');
        }
      </script>
      <style>
        .gradient-bg {
          background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
        }
        .card-hover {
          transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
        }
        .card-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
        }
      </style>
    </head>
    <body class="gradient-bg min-h-screen flex items-center justify-center py-12">
      <div class="container mx-auto max-w-lg bg-white p-8 rounded-2xl shadow-2xl">
        <h1 class="text-3xl font-bold text-gray-900 mb-8">📦 Asset Details</h1>
        
        <div class="bg-green-50 p-4 rounded-lg mb-6 text-center text-green-700 font-semibold shadow-sm">
          Scanned ${scans} time(s)
        </div>
        
        <div class="space-y-4">
          <div class="p-4 bg-white border border-gray-200 rounded-lg card-hover">
            <strong class="block text-sm font-medium text-gray-500 uppercase">Name</strong>
            <span class="text-lg font-semibold text-gray-800">${asset.id}</span>
          </div>
          
          <div class="p-4 bg-white border border-gray-200 rounded-lg card-hover">
            <strong class="block text-sm font-medium text-gray-500 uppercase">Asset ID</strong>
            <span class="text-lg font-semibold text-gray-800">${asset.name}</span>
          </div>
          
          <div class="p-4 bg-white border border-gray-200 rounded-lg card-hover">
            <strong class="block text-sm font-medium text-gray-500 uppercase">Location</strong>
            <span class="text-lg font-semibold text-gray-800">${asset.location}</span>
          </div>
          
          ${asset.department ? `
          <div class="p-4 bg-white border border-gray-200 rounded-lg card-hover">
            <strong class="block text-sm font-medium text-gray-500 uppercase">Department</strong>
            <span class="text-lg font-semibold text-gray-800">${asset.department}</span>
          </div>
          ` : ''}
          
          ${asset.desktopSetupDate ? `
          <div class="p-4 bg-white border border-gray-200 rounded-lg card-hover">
            <strong class="block text-sm font-medium text-gray-500 uppercase">Setup Date</strong>
            <span class="text-lg font-semibold text-gray-800">${new Date(asset.desktopSetupDate).toLocaleDateString()}</span>
          </div>
          ` : ''}
          
          ${scanHistoryHtml}
          
          <div class="text-center text-sm text-gray-500 mt-6">
            Generated by Asset QR Generator
          </div>
          
          <div class="flex flex-col space-y-2">
            <a href="/qr/all" class="block py-3 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-center font-semibold shadow-md">🖼 View All QR Codes</a>
            <a href="/" class="block py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-center font-semibold shadow-md">🏠 Back to Home</a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// API endpoint for JSON data
app.get('/api/asset/:id', (req, res) => {
  const asset = assets.get(req.params.id);
  if (!asset) {
    console.log(`API request failed: Asset ID ${req.params.id} not found`);
    res.status(404).json({ error: 'Asset not found', id: req.params.id });
    return;
  }
  res.json(asset);
});

// Start server
const server = app.listen(port, '0.0.0.0', () => {
  const baseUrl = getNetworkIP();
  console.log(`Server running at: ${baseUrl}`);
  console.log(`Install as PWA: Open in Chrome, click "Add to Home Screen" (mobile) or "+" in address bar (desktop)`);
  console.log(`For Render.com deployment: Ensure BASE_URL is set to https://your-app.onrender.com in environment variables`);
  console.log(`Assets stored in: ${dataFile} (Note: Render.com free tier has ephemeral storage)`);
  console.log(`Admin Login: ID=${ADMIN_ID}, Password=Set in .env`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Try a different port or kill the process.`);
    console.error(`To find and kill: 'lsof -i :${port}' then 'kill <pid>' (Mac/Linux) or 'netstat -ano | findstr :${port}' then 'taskkill /PID <pid> /F' (Windows)`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
  }
});
