var express = require("express");
var router = express.Router();
let { postUserValidator, validateResult } = require('../utils/validatorHandler')
let userController = require('../controllers/users')
let cartModel = require('../schemas/cart');
let { uploadExcel } = require('../utils/uploadHandler')
let roleModel = require('../schemas/roles')
let mailHandler = require('../utils/sendMailHandler')
let excelJS = require('exceljs')
let path = require('path')
let fs = require('fs')
let crypto = require('crypto')


let userModel = require("../schemas/users");
const { default: mongoose } = require("mongoose");
//- Strong password

const USER_EXCEL_PATH = path.join(__dirname, '../user.xlsx');

function resolveCellValue(cellValue) {
  if (cellValue && typeof cellValue === 'object') {
    if (cellValue.text) {
      return String(cellValue.text).trim();
    }
    if (cellValue.result !== undefined && cellValue.result !== null) {
      return String(cellValue.result).trim();
    }
  }
  if (cellValue === undefined || cellValue === null) {
    return '';
  }
  return String(cellValue).trim();
}

function generateRandomPassword(length = 16) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }
  return password;
}

async function importUsersFromExcel(excelPath) {
  if (!fs.existsSync(excelPath)) {
    return { status: 404, body: { message: 'Khong tim thay file user.xlsx' } };
  }

  let userRole = await roleModel.findOne({
    name: { $regex: /^user$/i },
    isDeleted: false
  });
  if (!userRole) {
    return { status: 400, body: { message: 'Khong tim thay role USER trong database' } };
  }

  let workbook = new excelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  let worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 2) {
    return { status: 400, body: { message: 'File user.xlsx khong co du lieu hop le' } };
  }

  let existingUsers = await userModel.find({ isDeleted: false }, { username: 1, email: 1 });
  let existingUsernames = new Set(existingUsers.map(u => u.username));
  let existingEmails = new Set(existingUsers.map(u => u.email));
  let importedUsernames = new Set();
  let importedEmails = new Set();

  let report = [];
  for (let index = 2; index <= worksheet.rowCount; index++) {
    let row = worksheet.getRow(index);
    let username = resolveCellValue(row.getCell(1).value);
    let email = resolveCellValue(row.getCell(2).value).toLowerCase();

    if (!username && !email) {
      continue;
    }
    if (!username || !email) {
      report.push({ row: index, success: false, message: 'Thieu username hoac email' });
      continue;
    }
    if (existingUsernames.has(username) || importedUsernames.has(username)) {
      report.push({ row: index, success: false, message: `Username ${username} da ton tai` });
      continue;
    }
    if (existingEmails.has(email) || importedEmails.has(email)) {
      report.push({ row: index, success: false, message: `Email ${email} da ton tai` });
      continue;
    }

    let session = await mongoose.startSession();
    session.startTransaction();
    let tempPassword = generateRandomPassword(16);

    try {
      let newUser = await userController.CreateAnUser(
        username,
        tempPassword,
        email,
        userRole._id,
        session
      );

      let newCart = new cartModel({ user: newUser._id });
      await newCart.save({ session });

      await session.commitTransaction();
      session.endSession();

      existingUsernames.add(username);
      existingEmails.add(email);
      importedUsernames.add(username);
      importedEmails.add(email);

      let emailStatus = 'sent';
      try {
        await mailHandler.sendUserPasswordMail(email, username, tempPassword);
      } catch (mailErr) {
        emailStatus = `failed: ${mailErr.message}`;
      }

      report.push({
        row: index,
        success: true,
        username: username,
        email: email,
        emailStatus: emailStatus
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      report.push({ row: index, success: false, message: err.message });
    }
  }

  return {
    status: 200,
    body: {
      message: 'Import user hoan tat',
      totalRows: worksheet.rowCount - 1,
      successCount: report.filter(item => item.success).length,
      failCount: report.filter(item => !item.success).length,
      report: report
    }
  };
}

router.get("/", async function (req, res, next) {
    let users = await userModel
      .find({ isDeleted: false })
      .populate({
        'path': 'role',
        'select': "name"
      })
    res.send(users);
  });

router.get("/:id([0-9a-fA-F]{24})", async function (req, res, next) {
  try {
    let result = await userModel
      .find({ _id: req.params.id, isDeleted: false })
    if (result.length > 0) {
      res.send(result);
    }
    else {
      res.status(404).send({ message: "id not found" });
    }
  } catch (error) {
    res.status(404).send({ message: "id not found" });
  }
});

router.get('/import-excel', async function (req, res, next) {
  try {
    let result = await importUsersFromExcel(USER_EXCEL_PATH);
    res.status(result.status).send(result.body);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

router.post("/",  postUserValidator, validateResult,
  async function (req, res, next) {
    let session = await mongoose.startSession()
    let transaction = session.startTransaction()
    try {
      let newItem = await userController.CreateAnUser(
        req.body.username,
        req.body.password,
        req.body.email,
        req.body.role,
        session
      )
      let newCart = new cartModel({
        user: newItem._id
      })
      let result = await newCart.save({ session })
      result = await result.populate('user')
      session.commitTransaction();
      session.endSession()
      res.send(result)
    } catch (err) {
      session.abortTransaction()
      session.endSession()
      res.status(400).send({ message: err.message });
    }
  });

router.post('/import-excel', uploadExcel.single('file'), async function (req, res, next) {
  let excelPath = req.file ? path.resolve(req.file.path) : USER_EXCEL_PATH;
  let needCleanup = Boolean(req.file);
  try {
    let result = await importUsersFromExcel(excelPath);
    res.status(result.status).send(result.body);
  } catch (error) {
    res.status(500).send({ message: error.message });
  } finally {
    if (needCleanup && fs.existsSync(excelPath)) {
      fs.unlinkSync(excelPath);
    }
  }
});

router.put("/:id", async function (req, res, next) {
  try {
    let id = req.params.id;
    let updatedItem = await userModel.findById(id);
    for (const key of Object.keys(req.body)) {
      updatedItem[key] = req.body[key];
    }
    await updatedItem.save();

    if (!updatedItem) return res.status(404).send({ message: "id not found" });

    let populated = await userModel
      .findById(updatedItem._id)
    res.send(populated);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

router.delete("/:id", async function (req, res, next) {
  try {
    let id = req.params.id;
    let updatedItem = await userModel.findByIdAndUpdate(
      id,
      { isDeleted: true },
      { new: true }
    );
    if (!updatedItem) {
      return res.status(404).send({ message: "id not found" });
    }
    res.send(updatedItem);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

module.exports = router;
