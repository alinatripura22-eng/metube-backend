const aws = require("aws-sdk");
const multer = require("multer");
const multerS3 = require("multer-s3");
const fs = require("fs");
const path = require("path");
const https = require("https");

const createS3Instance = (hostname, accessKeyId, secretAccessKey) => {
  return new aws.S3({
    accessKeyId,
    secretAccessKey,
    endpoint: new aws.Endpoint(hostname),
    s3ForcePathStyle: true,
  });
};

const digitalOceanS3 = createS3Instance(settingJSON.doHostname, settingJSON.doAccessKey, settingJSON.doSecretKey);

const awsS3 = createS3Instance(settingJSON.awsHostname, settingJSON.awsAccessKey, settingJSON.awsSecretKey);

const localStoragePath = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(localStoragePath)) {
  fs.mkdirSync(localStoragePath, { recursive: true });
}

// BunnyCDN custom multer storage engine
class BunnyCDNStorage {
  constructor(opts) {
    this.storageZone = opts.storageZone;
    this.storagePassword = opts.storagePassword;
    this.storageHostname = opts.storageHostname || "storage.bunnycdn.com";
  }

  _handleFile(req, file, cb) {
    const folder = req.body.folderStructure || "";
    const filePath = folder ? `${this.storageZone}/${folder}/${file.originalname}` : `${this.storageZone}/${file.originalname}`;

    const chunks = [];
    file.stream.on("data", (chunk) => chunks.push(chunk));
    file.stream.on("end", () => {
      const buffer = Buffer.concat(chunks);

      const options = {
        hostname: this.storageHostname,
        port: 443,
        path: `/${filePath}`,
        method: "PUT",
        headers: {
          AccessKey: this.storagePassword,
          "Content-Type": "application/octet-stream",
          "Content-Length": buffer.length,
        },
      };

      const uploadReq = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode === 201 || res.statusCode === 200) {
            cb(null, {
              path: filePath,
              size: buffer.length,
            });
          } else {
            cb(new Error(`BunnyCDN upload failed: ${res.statusCode} - ${body}`));
          }
        });
      });

      uploadReq.on("error", (err) => {
        cb(new Error(`BunnyCDN upload error: ${err.message}`));
      });

      uploadReq.write(buffer);
      uploadReq.end();
    });

    file.stream.on("error", (err) => cb(err));
  }

  _removeFile(req, file, cb) {
    cb(null);
  }
}

const storageOptions = {
  local: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, localStoragePath);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    },
  }),

  digitalocean: multerS3({
    s3: digitalOceanS3,
    bucket: settingJSON.doBucketName,
    acl: "public-read",
    key: (req, file, cb) => {
      console.log("request body in uploadMiddleware :  ", req.body);

      const folder = req.body.folderStructure;
      cb(null, `${folder}/${file.originalname}`);
    },
  }),

  aws: multerS3({
    s3: awsS3,
    bucket: settingJSON.awsBucketName,
    key: (req, file, cb) => {
      const folder = req.body.folderStructure;
      cb(null, `${folder}/${file.originalname}`);
    },
  }),

  bunnycdn: new BunnyCDNStorage({
    storageZone: settingJSON.bunnyStorageZone,
    storagePassword: settingJSON.bunnyStoragePassword,
    storageHostname: settingJSON.bunnyStorageHostname || "storage.bunnycdn.com",
  }),
};

const getActiveStorage = async () => {
  const settings = settingJSON;
  if (settings.storage.local) return "local";
  if (settings.storage.awsS3) return "aws";
  if (settings.storage.digitalOcean) return "digitalocean";
  if (settings.storage.bunnycdn) return "bunnycdn";
  return "local"; // Fallback to local storage if no storage is active
};

const uploadMiddleware = async (req, res, next) => {
  try {
    const activeStorage = await getActiveStorage(); // Dynamically fetch active storage

    multer({ storage: storageOptions[activeStorage] }).single("content")(req, res, next);
  } catch (error) {
    next(error); // Pass error to the error handler if any issue occurs
  }
};

module.exports = uploadMiddleware;
