//express
const express = require("express");
const app = express();

//cors
const cors = require("cors");

app.use(cors());
app.use(express.json());

//logging middleware
var logger = require("morgan");
app.use(logger("dev"));

//path
const path = require("path");

//dotenv
require("dotenv").config({ path: ".env" });

//node-cron
const cron = require("node-cron");

//moment
const moment = require("moment");

//connection.js
const db = require("./util/connection");

//fs
const fs = require("fs");

//socket io
const http = require("http");
const server = http.createServer(app);
global.io = require("socket.io")(server);

//import model
const Setting = require("./models/setting.model");

//settingJson
const settingJson = require("./setting");

//Declare global variable
global.settingJSON = {};

//handle global.settingJSON when pm2 restart
async function initializeSettings() {
  try {
    const setting = await Setting.findOne().sort({ createdAt: -1 });
    if (setting) {
      console.log("In setting initialize Settings");
      global.settingJSON = setting;
    } else {
      global.settingJSON = settingJson;
    }
  } catch (error) {
    console.error("Failed to initialize settings:", error);
  }
}

//Declare the function as a global variable to update the setting.js file
global.updateSettingFile = (settingData) => {
  const settingJSON = JSON.stringify(settingData, null, 2);
  fs.writeFileSync("setting.js", `module.exports = ${settingJSON};`, "utf8");

  global.settingJSON = settingData; // Update global variable
  console.log("Settings file updated.");
};

db.on("error", console.error.bind(console, "Connection Error: "));
db.once("open", async () => {
  console.log("Mongo: successfully connected to db");

  try {
    await initializeSettings();
    console.log("Settings initialized on startup");
  } catch (e) {
    console.error("initializeSettings failed on startup:", e);
  }

  require("./socket");

  const routes = require("./routes/index");
  app.use(routes);

  app.use("/uploads", express.static(path.join(__dirname, "uploads")));

  app.use(express.static(path.join(__dirname, "public")));
  app.get("/*", (req, res) => {
    res.status(200).sendFile(path.join(__dirname, "public", "index.html"));
  });

  const PORT = process.env.PORT;
  server.listen(PORT, () => {
    console.log("Hello World ! listening on " + PORT);
  });
});

//import model
const Video = require("./models/video.model");
const User = require("./models/user.model");
const UserWiseSubscription = require("./models/userWiseSubscription.model");

//Schedule a task to run every 10 minutes for update scheduleType from 1 to 2
cron.schedule("*/10 * * * *", async () => {
  console.log("this function will run every 10 minutes...");

  const currentTime = moment().toISOString(); //get the current date and time
  console.log("currentTime: ", currentTime);

  await Video.updateMany(
    {
      scheduleType: 1,
      scheduleTime: { $lt: currentTime }, //less than today's date and time
    },
    { $set: { scheduleType: 2 } }
  );
});

//Schedule a task to update user's daily watch Ads
cron.schedule("0 0 * * *", async () => {
  await User.updateMany(
    {
      "watchAds.count": { $gt: 0 },
      "watchAds.date": { $ne: null },
    },
    {
      $set: {
        "watchAds.count": 0,
        "watchAds.date": null,
      },
    }
  );
});

//Schedule a task automatically unsubscribed from channel (less than 30 days)
cron.schedule("0 0 * * *", async () => {
  try {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // Find subscriptions older than 30 days
    const expiredSubscriptions = await UserWiseSubscription.find({ createdAt: { $lt: oneMonthAgo }, isPublic: false });

    // Unsubscribe all users with expired subscriptions
    for (const subscription of expiredSubscriptions) {
      await UserWiseSubscription.deleteOne({ _id: subscription._id });
      console.log(`User ${subscription.userId} automatically unsubscribed from channel ${subscription.channelId}`);
    }
  } catch (error) {
    console.error("Error in the cron job:", error);
  }
});
