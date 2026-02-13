const fs = require("fs");
const path = require("path");
const https = require("https");
const { S3, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const deleteFromAwsS3 = async (fileUrl) => {
  try {
    const s3AwsClient = new S3({
      region: settingJSON.awsRegion,
      credentials: {
        accessKeyId: settingJSON.awsAccessKey,
        secretAccessKey: settingJSON.awsSecretKey,
      },
    });

    const urlObject = new URL(fileUrl);
    const bucketName = settingJSON.awsBucketName;

    let key = decodeURIComponent(urlObject.pathname.substring(1));
    if (key.startsWith(bucketName + "/")) {
      key = key.replace(bucketName + "/", "");
    }

    const bucketParams = {
      Bucket: bucketName,
      Key: key,
    };

    console.log("Deleting from S3:", bucketParams);
    await s3AwsClient.send(new DeleteObjectCommand(bucketParams));
    console.log("✅ Deleted successfully from S3:", bucketParams.Bucket + "/" + bucketParams.Key);
  } catch (err) {
    console.error("❌ S3 delete error:", {
      message: err.message,
      name: err.name,
      metadata: err.$metadata,
    });
  }
};

const deleteLocalFile = (relativePath) => {
  try {
    const uploadsFolder = path.resolve(__dirname, "../uploads");
    const absolutePath = path.join(uploadsFolder, relativePath);

    if (!absolutePath.startsWith(uploadsFolder)) {
      throw new Error("Attempt to delete outside uploads folder.");
    }

    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      console.log("Local file deleted:", absolutePath);
    } else {
      console.warn("File not found:", absolutePath);
    }
  } catch (err) {
    console.error("Error deleting local file:", err.message);
  }
};

const deleteFromS3 = async (fileUrl) => {
  try {
    const s3Client = new S3({
      forcePathStyle: false,
      endpoint: settingJSON?.doHostname,
      region: settingJSON?.doRegion,
      credentials: {
        accessKeyId: settingJSON?.doAccessKey,
        secretAccessKey: settingJSON?.doSecretKey,
      },
    });

    const urlObject = new URL(fileUrl);
    const key = decodeURIComponent(urlObject.pathname.substring(1)); // ✅ decode the path

    const bucketParams = {
      Bucket: settingJSON?.doBucketName,
      Key: key,
    };

    console.log("Deleting from S3:", bucketParams.Key);
    await s3Client.send(new DeleteObjectCommand(bucketParams));
    console.log("Deleted successfully from S3:", bucketParams.Bucket + "/" + bucketParams.Key);
  } catch (err) {
    console.error("S3 delete error:", err.message);
  }
};

const deleteFromBunnyCDN = async (fileUrl) => {
  try {
    const parsedUrl = new URL(fileUrl);
    const filePath = decodeURIComponent(parsedUrl.pathname.substring(1)); // remove leading /
    const storageZone = settingJSON?.bunnyStorageZone;
    const storagePassword = settingJSON?.bunnyStoragePassword;
    const storageHostname = settingJSON?.bunnyStorageHostname || "storage.bunnycdn.com";

    const deletePath = `/${storageZone}/${filePath}`;

    const options = {
      hostname: storageHostname,
      port: 443,
      path: deletePath,
      method: "DELETE",
      headers: {
        AccessKey: storagePassword,
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode === 200 || res.statusCode === 404) {
            console.log("✅ Deleted from BunnyCDN:", deletePath);
            resolve();
          } else {
            console.error("❌ BunnyCDN delete failed:", res.statusCode, body);
            resolve(); // Don't throw - file may already be deleted
          }
        });
      });
      req.on("error", (err) => {
        console.error("❌ BunnyCDN delete error:", err.message);
        resolve(); // Don't throw
      });
      req.end();
    });
  } catch (err) {
    console.error("❌ BunnyCDN delete error:", err.message);
  }
};

const deleteFromStorage = async (fileUrl) => {
  try {
    if (!fileUrl) return;

    const parsedUrl = new URL(fileUrl);
    const host = parsedUrl.hostname;
    const decodedPath = decodeURIComponent(parsedUrl.pathname);
    const relativePath = decodedPath.replace(/^\/uploads\//, "");

    if (!relativePath) {
      console.warn("Invalid path. Skipping deletion.");
      return;
    }

    const baseUrl = process.env.baseURL;
    const envHost = new URL(baseUrl).hostname;

    if (host === envHost || host === "localhost") {
      deleteLocalFile(relativePath);
    } else if (host.includes("digitaloceanspaces.com")) {
      await deleteFromS3(fileUrl, "digitalocean");
    } else if (host.includes("amazonaws.com")) {
      await deleteFromAwsS3(fileUrl, "aws");
    } else if (host.includes("b-cdn.net") || host.includes("bunnycdn.com")) {
      await deleteFromBunnyCDN(fileUrl);
    } else {
      console.warn("Unknown storage. Skipping deletion.");
    }
  } catch (error) {
    console.error("Error deleting file:", error.message);
  }
};

module.exports = { deleteFromStorage };
