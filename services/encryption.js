// Encryption Service
// Real AES-256 encryption for sensitive data

const crypto = require('crypto');

class EncryptionService {
    constructor(encryptionKey) {
        // Use provided key or generate one
        this.key = encryptionKey || process.env.ENCRYPTION_KEY;
        
        if (!this.key) {
            throw new Error('Encryption key is required');
        }

        // Ensure key is 32 bytes for AES-256
        this.key = crypto.createHash('sha256').update(String(this.key)).digest('base64').substr(0, 32);
        
        this.algorithm = 'aes-256-cbc';
    }

    // Generate a random IV
    generateIV() {
        return crypto.randomBytes(16);
    }

    // Encrypt data
    encrypt(text) {
        try {
            const iv = this.generateIV();
            const cipher = crypto.createCipheriv(this.algorithm, Buffer.from(this.key), iv);
            
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // Return IV + encrypted data (IV is needed for decryption)
            return {
                iv: iv.toString('hex'),
                encryptedData: encrypted,
                combined: iv.toString('hex') + ':' + encrypted
            };
        } catch (error) {
            console.error('Encryption error:', error);
            throw new Error('Failed to encrypt data');
        }
    }

    // Decrypt data
    decrypt(encryptedText, ivHex = null) {
        try {
            // If combined format (iv:encrypted)
            if (!ivHex && encryptedText.includes(':')) {
                const parts = encryptedText.split(':');
                ivHex = parts[0];
                encryptedText = parts[1];
            }

            if (!ivHex) {
                throw new Error('IV is required for decryption');
            }

            const iv = Buffer.from(ivHex, 'hex');
            const decipher = crypto.createDecipheriv(this.algorithm, Buffer.from(this.key), iv);
            
            let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('Failed to decrypt data');
        }
    }

    // Hash data (one-way, for passwords)
    hash(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    // Compare data with hash
    compareHash(data, hash) {
        const dataHash = this.hash(data);
        return crypto.timingSafeEqual(Buffer.from(dataHash), Buffer.from(hash));
    }

    // Generate API key
    generateApiKey(prefix = 'ak') {
        const randomPart = crypto.randomBytes(32).toString('hex');
        const timestamp = Date.now().toString(36);
        return `${prefix}_${timestamp}_${randomPart}`;
    }

    // Generate JWT secret
    generateJwtSecret() {
        return crypto.randomBytes(64).toString('hex');
    }

    // Encrypt object
    encryptObject(obj) {
        const jsonStr = JSON.stringify(obj);
        return this.encrypt(jsonStr);
    }

    // Decrypt object
    decryptObject(encryptedData, iv) {
        const jsonStr = this.decrypt(encryptedData, iv);
        return JSON.parse(jsonStr);
    }

    // Mask sensitive data (for logs)
    maskSensitiveData(data, visibleChars = 4) {
        if (!data) return data;
        
        const str = String(data);
        if (str.length <= visibleChars) return '*'.repeat(str.length);
        
        const visible = str.slice(-visibleChars);
        const masked = '*'.repeat(str.length - visibleChars);
        return masked + visible;
    }

    // Create signature for webhook verification
    createSignature(payload, secret) {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(JSON.stringify(payload));
        return hmac.digest('hex');
    }

    // Verify webhook signature
    verifySignature(payload, signature, secret) {
        const expectedSignature = this.createSignature(payload, secret);
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    }

    // Generate random token
    generateToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    // Generate verification code (6 digits)
    generateVerificationCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    // Encrypt file buffer
    encryptFile(buffer) {
        const iv = this.generateIV();
        const cipher = crypto.createCipheriv(this.algorithm, Buffer.from(this.key), iv);
        
        const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
        
        return {
            iv: iv.toString('hex'),
            data: encrypted.toString('hex')
        };
    }

    // Decrypt file buffer
    decryptFile(encryptedHex, ivHex) {
        const iv = Buffer.from(ivHex, 'hex');
        const encrypted = Buffer.from(encryptedHex, 'hex');
        
        const decipher = crypto.createDecipheriv(this.algorithm, Buffer.from(this.key), iv);
        
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        
        return decrypted;
    }
}

module.exports = EncryptionService;