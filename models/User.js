const mongoose = require("mongoose")

const userSchema = new mongoose.Schema({
    userid: {type: Number},
    name: String,
    isSubscribe: {type:Boolean, default: false},
    addedDate: {type: Date, default: Date.now},

    // 캠퍼스 구분
    공통: {type:Boolean, default: true},
    서울: {type:Boolean, default: true},
    에리카: {type:Boolean, default: true},

    // 공지사항 구분
    학사: {type:Boolean, default: true},
    입학: {type:Boolean, default: true},
    취업: {type:Boolean, default: true},
    창업: {type:Boolean, default: true},
    모집채용: {type:Boolean, default: true},
    경조사: {type:Boolean, default: true},
    일반: {type:Boolean, default: true},
    산학연구: {type:Boolean, default: true},
    장학: {type:Boolean, default: true},
    행사안내: {type:Boolean, default: true},
})

module.exports = mongoose.model('User', userSchema)