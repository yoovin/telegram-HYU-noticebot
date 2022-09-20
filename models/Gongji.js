const mongoose = require("mongoose")

const gongjiSchema = new mongoose.Schema({
    campus: String,
    title: {type: String},
    subject: String,
    authorTeam: String,
    disc: {type: String, default: ""},
    addedDate: {type: Date, default: Date.now}
})

module.exports = mongoose.model('Gongji', gongjiSchema)