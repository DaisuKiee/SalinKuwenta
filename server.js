const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for base64 images
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Explicit routes for special dashboards (MUST come BEFORE /:citizenId catch-all)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/barangay-official', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'barangay-official.html'));
});

// Multer for memory storage (no file system)
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || `mongodb+srv://tambayan:test@tambayan.ocgxnlm.mongodb.net/?retryWrites=true&w=majority&appName=salinkuwenta`)
    .then(() => console.log('Connected to MongoDB Atlas - SalinKuwenta'))
    .catch((err) => console.error('MongoDB connection error:', err));

// Image Schema for storing images
const imageSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    contentType: { type: String, required: true },
    data: { type: Buffer, required: true }, // Binary data
    size: { type: Number, required: true },
    uploadedBy: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
});

const Image = mongoose.model('Image', imageSchema);

// Enhanced User Schema
const userSchema = new mongoose.Schema({
    citizenId: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    birthdate: { type: Date, required: true },
    location: { type: String },
    password: { type: String, required: true },
    role: { 
        type: String, 
        enum: ['admin', 'resident', 'project_officer', 'finance_officer', 'barangay_leader'], 
        default: 'resident' 
    },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// Enhanced Complaint Schema with image ID reference
const complaintSchema = new mongoose.Schema({
    complaintId: { type: String, unique: true, required: true },
    citizenId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { 
        type: String, 
        enum: ['infrastructure', 'utilities', 'security', 'health', 'environment', 'other'],
        default: 'other'
    },
    photoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Image' }, // Reference to Image
    location: { type: String },
    status: { 
        type: String, 
        enum: ['pending', 'acknowledged', 'in_progress', 'resolved', 'closed'],
        default: 'pending' 
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    assignedTo: { type: String },
    resolution: { type: String },
    resolutionPhotoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Image' },
    resolvedAt: { type: Date },
    residentFeedback: { type: String },
    rating: { type: Number, min: 1, max: 5 }
}, { timestamps: true });

const Complaint = mongoose.model('Complaint', complaintSchema);

// Enhanced Project Schema with image references
const projectSchema = new mongoose.Schema({
    projectId: { type: String, unique: true, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: {
        type: String,
        enum: ['infrastructure', 'utilities', 'community', 'environment', 'health', 'education'],
        required: true
    },
    location: { type: String },
    budget: { type: Number, required: true },
    actualSpent: { type: Number, default: 0 },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    evidence: [{ 
        imageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Image' },
        description: String, 
        uploadedAt: { type: Date, default: Date.now }
    }],
    status: { 
        type: String, 
        enum: ['planning', 'pending_approval', 'approved', 'ongoing', 'completed', 'suspended'],
        default: 'planning' 
    },
    startDate: { type: Date },
    targetEndDate: { type: Date },
    actualEndDate: { type: Date },
    createdBy: { type: String, required: true },
    approvedBy: { type: String },
    approvalDate: { type: Date },
    milestones: [{
        title: String,
        description: String,
        targetDate: Date,
        completedDate: Date,
        status: { type: String, enum: ['pending', 'completed'], default: 'pending' }
    }],
    updates: [{
        description: String,
        progress: Number,
        photoIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Image' }],
        createdBy: String,
        createdAt: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

const Project = mongoose.model('Project', projectSchema);

// Enhanced Fund Schema with receipt reference
const fundSchema = new mongoose.Schema({
    transactionId: { type: String, unique: true, required: true },
    type: { 
        type: String, 
        enum: ['income', 'expense'],
        required: true 
    },
    subType: {
        type: String,
        enum: ['donation', 'government_allocation', 'utilities', 'maintenance', 'project', 'salary', 'supplies', 'other'],
        required: true
    },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    source: { type: String },
    projectId: { type: String },
    receiptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Image' }, // Reference to Image
    recordedBy: { type: String, required: true },
    approvedBy: { type: String },
    approvalStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    transactionDate: { type: Date, required: true },
    fiscalYear: { type: Number, required: true }
}, { timestamps: true });

const Fund = mongoose.model('Fund', fundSchema);

// Notification Schema
const notificationSchema = new mongoose.Schema({
    recipientId: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['complaint', 'project', 'fund', 'approval', 'general'],
        required: true 
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: { type: String },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date }
}, { timestamps: true });

const Notification = mongoose.model('Notification', notificationSchema);

// Utility Functions
function generateCitizenId() {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `CID-${timestamp.slice(-8)}-${random}`;
}

function generateComplaintId() {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `COMP-${timestamp.slice(-8)}-${random}`;
}

function generateProjectId() {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `PROJ-${timestamp.slice(-8)}-${random}`;
}

function generateTransactionId() {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `TXN-${timestamp.slice(-8)}-${random}`;
}

function calculateAge(birthdate) {
    if (!birthdate) return 0;  // Fallback
    const today = new Date();  // Use current date instead of hardcoded
    const birth = new Date(birthdate);
    if (isNaN(birth.getTime())) return 0;  // Invalid date
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

function getCurrentFiscalYear() {
    return new Date().getFullYear();
}

// Helper function to save image to MongoDB
async function saveImageToMongoDB(fileBuffer, filename, contentType, uploadedBy) {
    try {
        const image = new Image({
            filename,
            contentType,
            data: fileBuffer,
            size: fileBuffer.length,
            uploadedBy
        });
        await image.save();
        return image._id;
    } catch (error) {
        console.error('Image save error:', error);
        throw error;
    }
}

// Route to serve images from MongoDB
app.get('/api/images/:id', async (req, res) => {
    try {
        const image = await Image.findById(req.params.id);
        if (!image) {
            return res.status(404).json({ error: 'Image not found' });
        }
        res.set('Content-Type', image.contentType);
        res.set('Content-Length', image.size);
        res.send(image.data);
    } catch (error) {
        console.error('Image retrieval error:', error);
        res.status(500).json({ error: 'Failed to retrieve image' });
    }
});

// Enhanced Notification System
async function createNotification(recipientId, type, title, message, link = null) {
    try {
        const notification = new Notification({
            recipientId,
            type,
            title,
            message,
            link
        });
        await notification.save();
        
        const user = await User.findOne({ citizenId: recipientId });
        if (user && process.env.EMAIL_USER) {
            await transporter.sendMail({
                to: user.email,
                subject: `SalinKuwenta: ${title}`,
                text: message
            });
        }
        
        console.log(`Notification sent to ${recipientId}: ${message}`);
    } catch (error) {
        console.error('Notification error:', error);
    }
}

async function notifyMultipleUsers(recipientIds, type, title, message, link = null) {
    for (const recipientId of recipientIds) {
        await createNotification(recipientId, type, title, message, link);
    }
}

// Debug route to check user role (temporary - remove after fixing)
app.get('/debug/user/:id', async (req, res) => {
    try {
        const user = await User.findOne({ citizenId: req.params.id });
        res.json({ citizenId: user?.citizenId, role: user?.role, name: user?.name });
    } catch (error) {
        res.status(500).json({ error: 'Debug failed' });
    }
});

// Login Route (with added logging for debugging)
app.post('/api/login', async (req, res) => {
    try {
        const { citizenId, password } = req.body;
        console.log(`Login attempt for ${citizenId}`);  // Debug log
        const user = await User.findOne({ citizenId });
        if (!user) {
            console.log('User not found');  // Debug log
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            console.log('Password mismatch');  // Debug log
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        if (!user.isActive) {
            console.log('User inactive');  // Debug log
            return res.status(403).json({ error: 'Account is inactive' });
        }
        console.log(`Login success for ${citizenId}, role: ${user.role}`);  // Debug log
        await User.findOneAndUpdate({ citizenId }, { lastLogin: new Date() });
        res.json({ citizenId: user.citizenId, role: user.role, name: user.name });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Register Route
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, birthdate, password, location } = req.body;
        const age = calculateAge(birthdate);
        if (age < 18) {
            return res.status(400).json({ error: 'Must be 18 or older' });
        }
        const existingUser = await User.findOne({ $or: [{ email }, { citizenId: req.body.citizenId }] });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 12);
        const citizenId = generateCitizenId();
        const user = new User({
            citizenId,
            name,
            email,
            birthdate,
            location,
            password: hashedPassword,
            role: 'resident'
        });
        await user.save();
        res.json({ citizenId, message: 'Registration successful' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Get User Profile
app.get('/api/user/:citizenId', async (req, res) => {
    try {
        const user = await User.findOne({ citizenId: req.params.citizenId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({
            ...user.toObject(),
            age: calculateAge(user.birthdate)
        });
    } catch (error) {
        res.status(500).json({ error: 'Profile fetch failed' });
    }
});

// Update User Profile
app.put('/api/user/:citizenId', async (req, res) => {
    try {
        const userCitizenId = req.headers['x-citizen-id'];
        if (userCitizenId !== req.params.citizenId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        const updates = req.body;
        const user = await User.findOneAndUpdate(
            { citizenId: req.params.citizenId },
            updates,
            { new: true }
        );
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// Get All Users (Admin Only)
app.get('/api/users', async (req, res) => {
    try {
        const userCitizenId = req.headers['x-citizen-id'];
        const user = await User.findOne({ citizenId: userCitizenId });
        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin only' });
        }
        const users = await User.find({}, { password: 0 }).sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Users fetch failed' });
    }
});

// Update User (Admin Only)
app.put('/api/users/:citizenId', async (req, res) => {
    try {
        const userCitizenId = req.headers['x-citizen-id'];
        const user = await User.findOne({ citizenId: userCitizenId });
        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin only' });
        }
        const updates = req.body;
        const updatedUser = await User.findOneAndUpdate(
            { citizenId: req.params.citizenId },
            updates,
            { new: true }
        );
        res.json(updatedUser);
    } catch (error) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// Get Complaints
app.get('/api/complaints', async (req, res) => {
    try {
        const { citizenId, status } = req.query;
        const query = {};
        if (citizenId) query.citizenId = citizenId;
        if (status) query.status = status;
        const complaints = await Complaint.find(query)
            .populate('photoId', 'filename data contentType')
            .populate('resolutionPhotoId', 'filename data contentType')
            .sort({ createdAt: -1 });
        const complaintsWithPhotos = complaints.map(c => ({
            ...c.toObject(),
            photo: c.photoId ? `/api/images/${c.photoId._id}` : null,
            resolutionPhoto: c.resolutionPhotoId ? `/api/images/${c.resolutionPhotoId._id}` : null
        }));
        res.json(complaintsWithPhotos);
    } catch (error) {
        res.status(500).json({ error: 'Complaints fetch failed' });
    }
});

// Create Complaint
app.post('/api/complaints', upload.single('photo'), async (req, res) => {
    try {
        const { title, description, category, location, priority } = req.body;
        const userCitizenId = req.headers['x-citizen-id'];
        const photoId = req.file ? await saveImageToMongoDB(req.file.buffer, req.file.originalname, req.file.mimetype, userCitizenId) : null;
        const complaintId = generateComplaintId();
        const complaint = new Complaint({
            complaintId,
            citizenId: userCitizenId,
            title,
            description,
            category,
            photoId,
            location,
            priority
        });
        await complaint.save();
        await createNotification(
            userCitizenId,
            'complaint',
            'Complaint Submitted',
            `Your complaint "${title}" has been submitted and is pending review.`,
            `/complaints/${complaintId}`
        );
        // Notify officials
        const officials = await User.find({ role: { $in: ['project_officer', 'barangay_leader'] } });
        const officialIds = officials.map(u => u.citizenId);
        await notifyMultipleUsers(officialIds, 'complaint', 'New Complaint', `New complaint "${title}" submitted by ${userCitizenId}.`, `/complaints`);
        res.json(complaint);
    } catch (error) {
        console.error('Complaint creation error:', error);
        res.status(500).json({ error: 'Complaint submission failed' });
    }
});

// Update Complaint
app.put('/api/complaints/:id', async (req, res) => {
    try {
        const userCitizenId = req.headers['x-citizen-id'];
        const user = await User.findOne({ citizenId: userCitizenId });
        const { status, resolution, assignedTo } = req.body;
        const complaint = await Complaint.findById(req.params.id);
        if (!complaint) {
            return res.status(404).json({ error: 'Complaint not found' });
        }
        if (complaint.citizenId !== userCitizenId && !['project_officer', 'barangay_leader'].includes(user.role)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        const updates = { status };
        if (resolution) updates.resolution = resolution;
        if (assignedTo) updates.assignedTo = assignedTo;
        if (status === 'resolved') updates.resolvedAt = new Date();
        const updated = await Complaint.findByIdAndUpdate(req.params.id, updates, { new: true });
        await createNotification(
            complaint.citizenId,
            'complaint',
            `Complaint Updated: ${status}`,
            `Your complaint "${complaint.title}" has been updated to ${status}.`,
            `/complaints/${complaint.complaintId}`
        );
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// Get Projects
app.get('/api/projects', async (req, res) => {
    try {
        const { status, citizenId } = req.query;
        const query = {};
        if (status) query.status = status;
        if (citizenId) query.createdBy = citizenId;
        const projects = await Project.find(query)
            .populate('evidence.imageId', 'filename data contentType')
            .populate('updates.photoIds', 'filename data contentType')
            .sort({ createdAt: -1 });
        const projectsWithPhotos = projects.map(p => ({
            ...p.toObject(),
            evidence: p.evidence.map(e => ({ ...e.toObject(), imageUrl: `/api/images/${e.imageId._id}` })),
            updates: p.updates.map(u => ({ ...u.toObject(), photoUrls: u.photoIds.map(id => `/api/images/${id._id}`) }))
        }));
        res.json(projectsWithPhotos);
    } catch (error) {
        res.status(500).json({ error: 'Projects fetch failed' });
    }
});

// Create Project
app.post('/api/projects', upload.array('evidence', 5), async (req, res) => {
    try {
        const userCitizenId = req.headers['x-citizen-id'];
        const { title, description, category, location, budget, startDate, targetEndDate } = req.body;
        const projectId = generateProjectId();
        const evidence = [];
        if (req.files) {
            for (let file of req.files) {
                const imageId = await saveImageToMongoDB(file.buffer, file.originalname, file.mimetype, userCitizenId);
                evidence.push({ imageId, description: 'Initial evidence' });
            }
        }
        const project = new Project({
            projectId,
            title,
            description,
            category,
            location,
            budget: parseFloat(budget),
            evidence,
            startDate: new Date(startDate),
            targetEndDate: new Date(targetEndDate),
            createdBy: userCitizenId,
            status: 'pending_approval'
        });
        await project.save();
        await createNotification(
            userCitizenId,
            'project',
            'Project Submitted',
            `Your project "${title}" has been submitted for approval.`,
            `/projects/${projectId}`
        );
        // Notify approvers
        const approvers = await User.find({ role: 'barangay_leader' });
        const approverIds = approvers.map(u => u.citizenId);
        await notifyMultipleUsers(approverIds, 'approval', 'Project Approval Needed', `New project "${title}" by ${userCitizenId} awaits approval.`, `/projects`);
        res.json(project);
    } catch (error) {
        console.error('Project creation error:', error);
        res.status(500).json({ error: 'Project submission failed' });
    }
});

// Update Project
app.put('/api/projects/:id', upload.array('photos', 5), async (req, res) => {
    try {
        const userCitizenId = req.headers['x-citizen-id'];
        const { progress, description: updateDesc } = req.body;
        const photoIds = [];
        if (req.files) {
            for (let file of req.files) {
                const imageId = await saveImageToMongoDB(file.buffer, file.originalname, file.mimetype, userCitizenId);
                photoIds.push(imageId);
            }
        }
        const project = await Project.findByIdAndUpdate(
            req.params.id,
            {
                $push: {
                    updates: {
                        description: updateDesc,
                        progress: parseInt(progress),
                        photoIds,
                        createdBy: userCitizenId
                    }
                },
                $set: { progress: parseInt(progress) }
            },
            { new: true }
        ).populate('evidence.imageId').populate('updates.photoIds');
        res.json(project);
    } catch (error) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// Approve Project
app.put('/api/projects/:id/approve', async (req, res) => {
    try {
        const { approve } = req.body;
        const userCitizenId = req.headers['x-citizen-id'];
        const user = await User.findOne({ citizenId: userCitizenId });
        
        if (user.role !== 'barangay_leader') {
            return res.status(403).json({ error: 'Barangay leaders only' });
        }
        
        const project = await Project.findByIdAndUpdate(
            req.params.id,
            {
                status: approve ? 'approved' : 'planning',
                approvedBy: userCitizenId,
                approvalDate: approve ? new Date() : undefined
            },
            { new: true }
        ).lean();
        
        await createNotification(
            project.createdBy,
            'project',
            `Project ${approve ? 'Approved' : 'Returned'}`,
            `Your project "${project.title}" has been ${approve ? 'approved' : 'returned for revision'}`,
            `/projects/${project.projectId}`
        );
        
        res.json(project);
    } catch (error) {
        res.status(500).json({ error: 'Approval failed' });
    }
});

// Get Funds
app.get('/api/funds', async (req, res) => {
    try {
        const { status, type, fiscalYear } = req.query;
        const query = {};
        if (status) query.approvalStatus = status;
        if (type) query.type = type;
        if (fiscalYear) query.fiscalYear = parseInt(fiscalYear);
        const funds = await Fund.find(query)
            .populate('receiptId', 'filename data contentType')
            .sort({ transactionDate: -1 });
        const fundsWithReceipts = funds.map(f => ({
            ...f.toObject(),
            receipt: f.receiptId ? `/api/images/${f.receiptId._id}` : null
        }));
        res.json(fundsWithReceipts);
    } catch (error) {
        res.status(500).json({ error: 'Funds fetch failed' });
    }
});

// Create Fund
app.post('/api/funds', upload.single('receipt'), async (req, res) => {
    try {
        const userCitizenId = req.headers['x-citizen-id'];
        const { type, subType, amount, description, category, source, projectId, transactionDate, fiscalYear } = req.body;
        const transactionId = generateTransactionId();
        const receiptId = req.file ? await saveImageToMongoDB(req.file.buffer, req.file.originalname, req.file.mimetype, userCitizenId) : null;
        const fund = new Fund({
            transactionId,
            type,
            subType,
            amount: parseFloat(amount),
            description,
            category,
            source,
            projectId,
            receiptId,
            recordedBy: userCitizenId,
            transactionDate: new Date(transactionDate),
            fiscalYear: parseInt(fiscalYear) || getCurrentFiscalYear()
        });
        await fund.save();
        await createNotification(
            userCitizenId,
            'fund',
            'Transaction Recorded',
            `Transaction "${description}" (₱${amount}) has been recorded and is pending approval.`,
            '/funds'
        );
        // Notify approvers
        const approvers = await User.find({ role: 'barangay_leader' });
        const approverIds = approvers.map(u => u.citizenId);
        await notifyMultipleUsers(approverIds, 'approval', 'Fund Approval Needed', `New transaction "${description}" by ${userCitizenId} awaits approval.`, '/funds');
        res.json(fund);
    } catch (error) {
        console.error('Fund creation error:', error);
        res.status(500).json({ error: 'Fund recording failed' });
    }
});

// Approve Fund
app.put('/api/funds/:id/approve', async (req, res) => {
    try {
        const { approve } = req.body;
        const userCitizenId = req.headers['x-citizen-id'];
        const user = await User.findOne({ citizenId: userCitizenId });
        
        if (user.role !== 'barangay_leader') {
            return res.status(403).json({ error: 'Barangay leaders only' });
        }
        
        const fund = await Fund.findByIdAndUpdate(
            req.params.id,
            {
                approvalStatus: approve ? 'approved' : 'rejected',
                approvedBy: userCitizenId
            },
            { new: true }
        ).lean();
        
        const fundWithReceipt = {
            ...fund,
            receipt: fund.receiptId ? `/api/images/${fund.receiptId}` : null
        };
        
        await createNotification(
            fund.recordedBy,
            'fund',
            `Transaction ${approve ? 'Approved' : 'Rejected'}`,
            `Transaction ${fund.transactionId} (₱${fund.amount}) has been ${approve ? 'approved' : 'rejected'}`,
            '/funds'
        );
        
        res.json(fundWithReceipt);
    } catch (error) {
        res.status(500).json({ error: 'Approval failed' });
    }
});

// Get Funds Summary
app.get('/api/funds/summary', async (req, res) => {
    try {
        const currentYear = getCurrentFiscalYear();
        const summary = await Fund.aggregate([
            { $match: { fiscalYear: currentYear, approvalStatus: 'approved' } },
            { $group: {
                _id: '$type',
                total: { $sum: '$amount' }
            }}
        ]);
        const income = summary.find(s => s._id === 'income')?.total || 0;
        const expenses = summary.find(s => s._id === 'expense')?.total || 0;
        res.json({ income, expenses, balance: income - expenses });
    } catch (error) {
        res.status(500).json({ error: 'Summary failed' });
    }
});

app.get('/api/funds/summary/all', async (req, res) => {
    try {
        const summaries = await Fund.aggregate([
            { $match: { approvalStatus: 'approved' } },
            { $group: {
                _id: { $year: '$transactionDate' },
                income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
                expenses: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } }
            }},
            { $sort: { _id: 1 } }
        ]);
        res.json(summaries);
    } catch (error) {
        res.status(500).json({ error: 'Summary failed' });
    }
});

// Get Notifications
app.get('/api/notifications/:citizenId', async (req, res) => {
    try {
        const { citizenId } = req.params;
        const notifications = await Notification.find({ recipientId: citizenId })
            .sort({ createdAt: -1 })
            .limit(50);
        
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Mark Notification as Read
app.put('/api/notifications/:id/read', async (req, res) => {
    try {
        const notification = await Notification.findByIdAndUpdate(
            req.params.id,
            { isRead: true, readAt: new Date() },
            { new: true }
        );
        res.json(notification);
    } catch (error) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// Dashboard Analytics
app.get('/api/analytics/dashboard/:citizenId', async (req, res) => {
    try {
        const { citizenId } = req.params;
        const user = await User.findOne({ citizenId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const currentYear = getCurrentFiscalYear();
        
        const totalProjects = await Project.countDocuments({ status: { $ne: 'planning' } });
        const ongoingProjects = await Project.countDocuments({ status: 'ongoing' });
        const completedProjects = await Project.countDocuments({ status: 'completed' });
        
        const fundSummary = await Fund.aggregate([
            { $match: { fiscalYear: currentYear, approvalStatus: 'approved' } },
            { $group: {
                _id: '$type',
                total: { $sum: '$amount' }
            }}
        ]);
        
        const income = fundSummary.find(f => f._id === 'income')?.total || 0;
        const expenses = fundSummary.find(f => f._id === 'expense')?.total || 0;
        
        const totalUsers = await User.countDocuments({ isActive: true });
        const totalResidents = await User.countDocuments({ role: 'resident', isActive: true });
        const totalOfficials = await User.countDocuments({ role: { $in: ['project_officer', 'finance_officer', 'barangay_leader', 'admin'] }, isActive: true });
        
        let roleSpecificStats = {};
        
        if (user.role === 'resident') {
            roleSpecificStats = {
                myComplaints: await Complaint.countDocuments({ citizenId }),
                resolvedComplaints: await Complaint.countDocuments({ 
                    citizenId, 
                    status: 'resolved' 
                })
            };
        } else if (user.role === 'finance_officer') {
            roleSpecificStats = {
                pendingApprovals: await Fund.countDocuments({ 
                    approvalStatus: 'pending' 
                }),
                monthlyIncome: income,
                monthlyExpenses: expenses
            };
        } else if (['project_officer', 'barangay_leader', 'admin'].includes(user.role)) {
            roleSpecificStats = {
                pendingComplaints: await Complaint.countDocuments({ 
                    status: { $in: ['pending', 'acknowledged'] }
                }),
                pendingProjectApprovals: await Project.countDocuments({ 
                    status: 'pending_approval' 
                }),
                pendingFundApprovals: await Fund.countDocuments({ 
                    approvalStatus: 'pending' 
                })
            };
        }
        
        res.json({
            totalProjects,
            ongoingProjects,
            completedProjects,
            currentBalance: income - expenses,
            income,
            expenses,
            totalUsers,
            totalResidents,
            totalOfficials,
            ...roleSpecificStats
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Analytics fetch failed' });
    }
});

// Transparency Report
app.get('/api/reports/transparency/:year', async (req, res) => {
    try {
        const year = parseInt(req.params.year);
        
        const funds = await Fund.find({ 
            fiscalYear: year,
            approvalStatus: 'approved'
        });
        
        const projects = await Project.find({
            createdAt: {
                $gte: new Date(`${year}-01-01`),
                $lte: new Date(`${year}-12-31`)
            }
        });
        
        const complaints = await Complaint.find({
            createdAt: {
                $gte: new Date(`${year}-01-01`),
                $lte: new Date(`${year}-12-31`)
            }
        });
        
        const income = funds
            .filter(f => f.type === 'income')
            .reduce((sum, f) => sum + f.amount, 0);
        
        const expenses = funds
            .filter(f => f.type === 'expense')
            .reduce((sum, f) => sum + f.amount, 0);
        
        const expensesByCategory = {};
        funds.filter(f => f.type === 'expense').forEach(f => {
            expensesByCategory[f.category] = (expensesByCategory[f.category] || 0) + f.amount;
        });
        
        const incomeBySource = {};
        funds.filter(f => f.type === 'income').forEach(f => {
            const source = f.source || 'Other';
            incomeBySource[source] = (incomeBySource[source] || 0) + f.amount;
        });
        
        res.json({
            year,
            summary: {
                totalIncome: income,
                totalExpenses: expenses,
                balance: income - expenses,
                totalProjects: projects.length,
                completedProjects: projects.filter(p => p.status === 'completed').length,
                totalComplaints: complaints.length,
                resolvedComplaints: complaints.filter(c => c.status === 'resolved').length
            },
            expensesByCategory,
            incomeBySource,
            projects: projects.map(p => ({
                title: p.title,
                status: p.status,
                budget: p.budget,
                actualSpent: p.actualSpent,
                progress: p.progress
            })),
            topExpenses: funds
                .filter(f => f.type === 'expense')
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 10)
                .map(f => ({
                    description: f.description,
                    amount: f.amount,
                    category: f.category,
                    date: f.transactionDate
                }))
        });
    } catch (error) {
        console.error('Report error:', error);
        res.status(500).json({ error: 'Report generation failed' });
    }
});

// Get available years
app.get('/api/reports/years', async (req, res) => {
    try {
        const years = await Fund.distinct('fiscalYear');
        res.json(years.sort((a, b) => b - a));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch years' });
    }
});

// Delete image (optional - for cleanup)
app.delete('/api/images/:id', async (req, res) => {
    try {
        const userCitizenId = req.headers['x-citizen-id'];
        const user = await User.findOne({ citizenId: userCitizenId });
        
        if (!['finance_officer', 'project_officer', 'barangay_leader'].includes(user.role)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const image = await Image.findById(req.params.id);
        if (!image) {
            return res.status(404).json({ error: 'Image not found' });
        }
        
        // Check if image is being used
        const complaintUsingImage = await Complaint.findOne({
            $or: [{ photoId: image._id }, { resolutionPhotoId: image._id }]
        });
        
        const projectUsingImage = await Project.findOne({
            $or: [
                { 'evidence.imageId': image._id },
                { 'updates.photoIds': image._id }
            ]
        });
        
        const fundUsingImage = await Fund.findOne({ receiptId: image._id });
        
        if (complaintUsingImage || projectUsingImage || fundUsingImage) {
            return res.status(400).json({ error: 'Image is being used and cannot be deleted' });
        }
        
        await Image.findByIdAndDelete(req.params.id);
        res.json({ message: 'Image deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// Get image metadata
app.get('/api/images/:id/metadata', async (req, res) => {
    try {
        const image = await Image.findById(req.params.id, { data: 0 }); // Exclude binary data
        if (!image) {
            return res.status(404).json({ error: 'Image not found' });
        }
        res.json(image);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch metadata' });
    }
});

// Static file routes (AFTER explicit routes)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/:citizenId', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
// app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
// app.get('/barangay-official', (req, res) => res.sendFile(path.join(__dirname, 'public', 'barangay-official.html')));

// Start server
app.listen(port, () => {
    console.log(`SalinKuwenta running at http://localhost:${port}`);
    console.log('Images are now stored in MongoDB instead of file system');
});