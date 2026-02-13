const Setting = require("../../models/setting.model");
const Advertise = require("../../models/advertise.model");

//get setting
exports.get = async (req, res) => {
  try {
    const [advertise, setting] = await Promise.all([Advertise.findOne().sort({ createdAt: -1 }), global.settingJSON ? global.settingJSON : null]);

    if (!setting) {
      return res.status(200).json({ status: false, message: "Setting does not found." });
    }

    if (!advertise) {
      return res.status(200).json({ status: false, message: "Advertise Setting does not found." });
    }

    return res.status(200).json({ status: true, message: "Success", setting: { ...setting._doc, ...advertise._doc } });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
