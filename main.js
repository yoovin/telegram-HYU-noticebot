/*
=============
1. 캠퍼스구분
공통, 서울, 에리카

2. 공지구분
학사, 입학, 취업, 창업, 모집채용, 경조사, 일반, 산학연구, 장학, 행사안내
=============
*/


const puppeteer = require("puppeteer")
const cheerio = require("cheerio")
const schedule = require("node-schedule")
const mongoose = require("mongoose")
const TelegramBot = require("node-telegram-bot-api")
const logger = require("./winston")

require("dotenv").config() // .env 파일 사용

// mongoose model
const User = require("./models/User")
const Gongji = require("./models/Gongji")

const token = process.env.TOKEN // Hyu_notice_test
const bot = new TelegramBot(token, {polling: true})

mongoose.connect("mongodb://localhost/Hyu_notice")

let gonglist = []


const crawl = async () => {
    // 크롤링 시작
    const browser = await puppeteer.launch({headless: true, args:["--lang=ko"]});
    logger.info("브라우저 시작")
    const page = await browser.newPage();
    const hyu_id = process.env.ID
    const hyu_pw = process.env.PW

    await page.goto("https://portal.hanyang.ac.kr/sso/lgin.do")
    await page.evaluate((id, pw) => {
        document.querySelector('#userId').value = id;
        document.querySelector('#password').value = pw;
        }, hyu_id, hyu_pw);
    await page.keyboard.press("Enter")
    logger.info("로그인 완료")
    await page.waitForNavigation()
    await page.click('input#btn_cancel');
    await page.goto("https://portal.hanyang.ac.kr/port.do#!UDMwODIwMCRAXiRAXmNvbW0vZ2pzaCRAXk0wMDYyNjMkQF7qs7Xsp4Dsgqztla0kQF5NMDAzNzgxJEBeMGJlMjk1OTM2MjY0MjlkZmMzZjFiNjE4MDQ1YmM4MTcyYjg2ODMyZGYwZDMzM2JjMGY1ZGI0NzE5OWI5MDI4YQ==",
    {waitUntil: "networkidle0"})
    logger.info("공지사항 이동 완료")
    await page.waitForNetworkIdle()
    logger.info("공지사항 로드 완료")
    const content = await page.content()
    const $ = cheerio.load(content)
    const lists = $('table#mainGrid > tbody > tr')
    lists.each((index, list) => {
        gonglist[index] = {
            title: $(list).find("#title").text(),
            subject:$(list).find("#gongjiNm").text(),
            authorTeam:$(list).find("#sosokNm").text().replace(/\s/g, "")
        }
        if($(list).find("#gb").text() == 'H'){
            gonglist[index].campus = "공통"
        }else if($(list).find("#gb").text() == 'S'){
            gonglist[index].campus = "서울"
        }else{
            gonglist[index].campus = "에리카"
        }
    })
    await updateGongjiToDB()
    await browser.close()
    logger.info("브라우저 종료")

}

const sendAllSubMem = (msg, gongji) => {
    User.find({isSubscribe: true}, (err, users) => {
        if(err) logger.error(err)
        for(let i = 0; i < users.length; i++){
            if(users[i][gongji.campus] && users[i][gongji.subject]){
                bot.sendMessage(users[i].userid, msg)
                logger.info(`${users[i].userid}, ${msg} 전송`)
            }
        }
    })
}

const updateGongjiToDB = async () => {
    let isUpdate = false
    for await (let item of gonglist){
        const searchedGongji = await Gongji.findOne({title: item.title})
        if(searchedGongji == null){
            // 데이터베이스에 없는 공지사항이라면
            isUpdate = true
            const gongji = new Gongji(item)
            gongji.save((err, gongji) => {
                if(err) return logger.error(err)
                logger.info(`공지 DB 추가, 제목: ${gongji.title}`)
                sendAllSubMem(makeMsg(gongji), gongji)
                })
            }
    }

    if(isUpdate){
        logger.info("공지사항 업데이트 및 전송 완료")
    }else{
        logger.info("데이터베이스 변동사항 없음")
    }
}

const gudokMessage = (user) => {
    return `
    [ 구독관리 ]
구독받고자 하는 공지사항을 선택할 수 있습니다.
✓ 표시가 되어있는 항목에 대해 공지사항을 받을 수 있습니다.

 * 캠퍼스 *
공통: ${user.공통 ? '[ ✓ ]' :'[ ]'}
서울: ${user.서울 ? '[ ✓ ]' :'[ ]'}
에리카: ${user.에리카 ? '[ ✓ ]' :'[ ]'}

 * 공지사항 *
학사: ${user.학사 ? '[ ✓ ]' :'[ ]'}
입학: ${user.입학 ? '[ ✓ ]' :'[ ]'}
취업: ${user.취업 ? '[ ✓ ]' :'[ ]'}
창업: ${user.창업 ? '[ ✓ ]' :'[ ]'}
모집채용: ${user.모집채용 ? '[ ✓ ]' :'[ ]'}
경조사: ${user.경조사 ? '[ ✓ ]' :'[ ]'}
일반: ${user.일반 ? '[ ✓ ]' :'[ ]'}
산학연구: ${user.산학연구 ? '[ ✓ ]' :'[ ]'}
장학: ${user.장학 ? '[ ✓ ]' :'[ ]'}
행사안내: ${user.행사안내 ? '[ ✓ ]' :'[ ]'}
    `
}

const makeMsg = (gongji) => {
    return `
#${gongji.campus} | #${gongji.subject} | #${gongji.authorTeam}
${gongji.title}
    `
}

/*
=================
    봇 응답 파트
=================
*/

bot.onText(/\/start/, msg => {
    const message = `
안녕하세요!

한양대학교 공지사항을 보내드리는 Hyu_notice입니다.

명령어버튼을 누르거나 [ /명령어 ]를 입력해 이용가능한 명령어를 확인 해 주세요.
`
    bot.sendMessage(msg.chat.id, message, {
        "reply_markup": {
            "inline_keyboard":
            [
                [
                    {text: "명령어", callback_data: "명령어"}
                ],
            ]
        }
    })
    User.findOne({userid: msg.chat.id}, (err, user) => {
        if(err) logger.error(err)
        if(user == null){
            const user = new User({
                userid: msg.chat.id,
                name: msg.chat.first_name + msg.chat.last_name
            })
            user.save((err, user) => {
                if(err) logger.error(err)
                logger.info(`유저추가, ${user.userid}`)
            })
        }
        return
    })
})

bot.onText(/\/명령어/, msg => {
    const message = `명령어입니다.
    
[ 구독 ]을 클릭해 구독을 시작해주세요.
구독중이지 않을 경우 알림을 받을 수 없습니다.

[ 구독취소 ] 클릭 시 구독이 취소됩니다.

[ 구독관리 ] 클릭 시 구독받을 항목을 선택 할 수 있습니다.

[이전 공지사항 보기] 클릭 시 받지못했던 공지사항을 다시 받아볼 수 있습니다.

공지사항 구독 시 매 10분마다 확인 후 새로운 공지사항이 등록되면 채팅방으로 보내드립니다.

공지사항은 공지글의 제목으로 전송되며 자세한 내용은 포털 내 공지사항을 확인해주세요.
                    `
        bot.sendMessage(reqMsg.chat.id, message, {
            "reply_markup": {
                "inline_keyboard":
                [
                    [
                        {text: "구독하기", callback_data: "구독"}
                    ],
                    [
                        {text: "구독취소", callback_data: "구독취소"}
                    ],
                    [
                        {text: "구독관리", callback_data: "구독관리"}
                    ],
                    [
                        {text: "이전 공지사항 보기", callback_data: "이전공지"}
                    ],
                    [
                        {text: "X 종료하기", callback_data: "종료"}
                    ]
                ]
            }
        })
})

bot.on("callback_query", query => {
    reqMsg = query.message
    bot.answerCallbackQuery(query.id)
    .then(() => {
        // 구독관리로 넘어감
        if(query.data.substring(0, 1) == 'J'){ // json으로 받아서 바꿈
            const dataToJson = JSON.parse(query.data.substring(1))
            const payload = dataToJson.query
            User.findOne({userid: reqMsg.chat.id}, (err, user) => {
                if(err) logger.error(err)
                user[dataToJson[payload]] = !user[dataToJson[payload]]
                user.save(err => {
                    if (err) logger.error(err)
                })
                const message = gudokMessage(user)
                if(payload == "캠퍼스"){
                    bot.editMessageText(message, {
                        chat_id: reqMsg.chat.id, 
                            message_id:reqMsg.message_id,
                            "reply_markup": {
                                "inline_keyboard":
                                [
                                    [
                                        {text: "공통", callback_data: 'J{"query":"캠퍼스", "캠퍼스":"공통"}'}
                                    ],
                                    [
                                        {text: "서울", callback_data: 'J{"query":"캠퍼스", "캠퍼스":"서울"}'}
                                    ],
                                    [
                                        {text: "에리카", callback_data: 'J{"query":"캠퍼스", "캠퍼스":"에리카"}'}
                                    ],
                                    [
                                        {text: "⮐ 돌아가기", callback_data: "구독관리"}
                                    ],
                                ],
                            },
                        })
                }else if(payload == "공지사항"){
                    bot.editMessageText(message, {
                        chat_id: reqMsg.chat.id, 
                            message_id:reqMsg.message_id,
                            "reply_markup": {
                                "inline_keyboard":
                                [
                                    [
                                        {text: "학사", callback_data: 'J{"query":"공지사항", "공지사항":"학사"}'}
                                    ],
                                    [
                                        {text: "입학", callback_data: 'J{"query":"공지사항", "공지사항":"입학"}'}
                                    ],
                                    [
                                        {text: "취업", callback_data: 'J{"query":"공지사항", "공지사항":"취업"}'}
                                    ],
                                    [
                                        {text: "창업", callback_data: 'J{"query":"공지사항", "공지사항":"창업"}'}
                                    ],
                                    [
                                        {text: "모집채용", callback_data: 'J{"query":"공지사항", "공지사항":"모집채용"}'}
                                    ],
                                    [
                                        {text: "경조사", callback_data: 'J{"query":"공지사항", "공지사항":"경조사"}'}
                                    ],
                                    [
                                        {text: "일반", callback_data: 'J{"query":"공지사항", "공지사항":"일반"}'}
                                    ],
                                    [
                                        {text: "산학연구", callback_data: 'J{"query":"공지사항", "공지사항":"산학연구"}'}
                                    ],
                                    [
                                        {text: "장학", callback_data: 'J{"query":"공지사항", "공지사항":"장학"}'}
                                    ],
                                    [
                                        {text: "행사안내", callback_data: 'J{"query":"공지사항", "공지사항":"행사안내"}'}
                                    ],
                                    [
                                        {text: " ⮐ 돌아가기", callback_data: '구독관리'}
                                    ],
                                ],
                            },
                        })
                }
                
            })
            

        }else{
            switch(query.data) {
                case "명령어": {
                    const message = `명령어입니다.
    
[ 구독 ]을 클릭해 구독을 시작해주세요.
구독중이지 않을 경우 알림을 받을 수 없습니다.

[ 구독취소 ] 클릭 시 구독이 취소됩니다.

[ 구독관리 ] 클릭 시 구독받을 항목을 선택 할 수 있습니다.

[이전 공지사항 보기] 클릭 시 받지못했던 공지사항을 다시 받아볼 수 있습니다.

공지사항 구독 시 매 10분마다 확인 후 새로운 공지사항이 등록되면 채팅방으로 보내드립니다.

공지사항은 공지글의 제목으로 전송되며 자세한 내용은 포털 내 공지사항을 확인해주세요.
                    `
                    bot.editMessageText(message, {
                        chat_id: reqMsg.chat.id, 
                        message_id:reqMsg.message_id,
                        "reply_markup": {
                            "inline_keyboard":
                            [
                                [
                                    {text: "구독하기", callback_data: "구독"}
                                ],
                                [
                                    {text: "구독취소", callback_data: "구독취소"}
                                ],
                                [
                                    {text: "구독관리", callback_data: "구독관리"}
                                ],
                                [
                                    {text: "이전 공지사항 보기", callback_data: "이전공지"}
                                ],
                                [
                                    {text: "X 종료하기", callback_data: "종료"}
                                ]
                            ]
                        }
                    })
                    break
                }
    
                case "구독":
                    User.findOne({userid: reqMsg.chat.id}, (err, user) => {
                        if(err) logger.error(err)
                        if(user.isSubscribe == true){
                            bot.sendMessage(reqMsg.chat.id, "[ 구독하기 ]\n이미 구독중 입니다.")
                            return
                        }else{
                            user.isSubscribe = true
                            user.save(err => {
                                if (err) logger.error(err)
                            })
                            bot.sendMessage(reqMsg.chat.id, "[ 구독하기 ]\n구독을 시작합니다.")
                            return
                        }
                        
                    })
                    break
    
                case "구독취소":
                    User.findOne({userid: reqMsg.chat.id}, (err, user) => {
                        if(err) logger.error(err)
                        if(user.isSubscribe == false){
                            bot.sendMessage(reqMsg.chat.id, "[ 구독취소 ]\n구독중이 아닙니다.")
                            return
                        }else{
                            user.isSubscribe = false
                            user.save(err => {
                                if (err) logger.error(err)
                            })
                            bot.sendMessage(reqMsg.chat.id, "[ 구독취소 ]\n구독을 취소합니다.")
                            return
                        }
                    })
                    break
                /* 
                    ===== 구독관리 파트 =====
                */
                case "구독관리":
                    User.findOne({userid: reqMsg.chat.id}, (err, user) => {
                    if(err) logger.error(err)
                    let message = gudokMessage(user)
                    bot.editMessageText(message, {
                        chat_id: reqMsg.chat.id, 
                            message_id:reqMsg.message_id,
                            "reply_markup": {
                                "inline_keyboard":
                                [
                                    [
                                        {text: "캠퍼스 관리", callback_data: "캠퍼스_관리"}
                                    ],
                                    [
                                        {text: "공지사항 관리", callback_data: "공지사항_관리"}
                                    ],
                                    [
                                        {text: "⮐ 돌아가기", callback_data: "명령어"}
                                    ],
                                    [
                                        {text: "X 종료하기", callback_data: "종료"}
                                    ]
                                ],
                            },
                        })
                })
                    break
    
                case "캠퍼스_관리":
                    User.findOne({userid: reqMsg.chat.id}, (err, user) => {
                    if(err) logger.error(err)
                    let message = gudokMessage(user)
                    bot.editMessageText(message, {
                        chat_id: reqMsg.chat.id, 
                            message_id:reqMsg.message_id,
                            "reply_markup": {
                                "inline_keyboard":
                                [
                                    [
                                        {text: "공통", callback_data: 'J{"query":"캠퍼스", "캠퍼스":"공통"}'}
                                    ],
                                    [
                                        {text: "서울", callback_data: 'J{"query":"캠퍼스", "캠퍼스":"서울"}'}
                                    ],
                                    [
                                        {text: "에리카", callback_data: 'J{"query":"캠퍼스", "캠퍼스":"에리카"}'}
                                    ],
                                    [
                                        {text: "⮐ 돌아가기", callback_data: "구독관리"}
                                    ],
                                    [
                                        {text: "X 종료하기", callback_data: "종료"}
                                    ]
                                ],
                            },
                        })
                })
                    break

                case "공지사항_관리":
                    User.findOne({userid: reqMsg.chat.id}, (err, user) => {
                    if(err) logger.error(err)
                    let message = gudokMessage(user)
                    bot.editMessageText(message, {
                        chat_id: reqMsg.chat.id, 
                            message_id:reqMsg.message_id,
                            "reply_markup": {
                                "inline_keyboard":
                                [
                                    [
                                        {text: "학사", callback_data: 'J{"query":"공지사항", "공지사항":"학사"}'}
                                    ],
                                    [
                                        {text: "입학", callback_data: 'J{"query":"공지사항", "공지사항":"입학"}'}
                                    ],
                                    [
                                        {text: "취업", callback_data: 'J{"query":"공지사항", "공지사항":"취업"}'}
                                    ],
                                    [
                                        {text: "창업", callback_data: 'J{"query":"공지사항", "공지사항":"창업"}'}
                                    ],
                                    [
                                        {text: "모집채용", callback_data: 'J{"query":"공지사항", "공지사항":"모집채용"}'}
                                    ],
                                    [
                                        {text: "경조사", callback_data: 'J{"query":"공지사항", "공지사항":"경조사"}'}
                                    ],
                                    [
                                        {text: "일반", callback_data: 'J{"query":"공지사항", "공지사항":"일반"}'}
                                    ],
                                    [
                                        {text: "산학연구", callback_data: 'J{"query":"공지사항", "공지사항":"산학연구"}'}
                                    ],
                                    [
                                        {text: "장학", callback_data: 'J{"query":"공지사항", "공지사항":"장학"}'}
                                    ],
                                    [
                                        {text: "행사안내", callback_data: 'J{"query":"공지사항", "공지사항":"행사안내"}'}
                                    ],
                                    [
                                        {text: "⮐ 돌아가기", callback_data: '구독관리'}
                                    ],
                                    [
                                        {text: "X 종료하기", callback_data: "종료"}
                                    ]
                                ],
                            },
                        })
                })
                    break
                
                /* 
                    ===== 이전공지보기 파트 =====
                */
                case "이전공지": {
                    const message = `
                    [ 이전 공지사항 보기 ]
    받고자하는 공지사항의 개수를 선택해주세요.
    
    공지사항은 최근 10, 20, 30개까지 받아보실수있습니다.
                    `
                        bot.editMessageText(message, {
                            chat_id: reqMsg.chat.id, 
                            message_id:reqMsg.message_id,
                            "reply_markup": {
                                "inline_keyboard":
                                [
                                    [
                                        {text: "10개", callback_data: "공지_10개"}
                                    ],
                                    [
                                        {text: "20개", callback_data: "공지_20개"}
                                    ],
                                    [
                                        {text: "30개", callback_data: "공지_30개"}
                                    ],
                                    [
                                        {text: "⮐ 돌아가기", callback_data: "명령어"}
                                    ],
                                    [
                                        {text: "X 종료하기", callback_data: "종료"}
                                    ]
                                ],
                            },
                        })
                    break
                }
            
                case "공지_10개": {
                    const message = `
                    [ 이전 공지사항 보기 ]
    받고자하는 공지사항의 개수를 선택해주세요.
    
    공지사항은 최근 10, 20, 30개까지 받아보실수있습니다.
                    `
                    bot.editMessageText(message, {
                        chat_id: reqMsg.chat.id, 
                        message_id:reqMsg.message_id,
                        "reply_markup": {},
                    })
                    Gongji.find(async (err, gongji) => {
                        for(let i = gongji.length-1; i >= 0 ; i--){
                            await bot.sendMessage(reqMsg.chat.id, makeMsg(gongji[i]))
                        }
                    }).limit(10).sort({addedDate:-1})
                    break
                }
    
                case "공지_20개": {
                    const message = `
                    [ 이전 공지사항 보기 ]
    받고자하는 공지사항의 개수를 선택해주세요.
    
    공지사항은 최근 10, 20, 30개까지 받아보실수있습니다.
                    `
                    bot.editMessageText(message, {
                        chat_id: reqMsg.chat.id, 
                        message_id:reqMsg.message_id,
                        "reply_markup": {},
                    })
                    Gongji.find(async(err, gongji) => {
                        for(let i = gongji.length-1; i >= 0 ; i--){
                            await bot.sendMessage(reqMsg.chat.id, makeMsg(gongji[i]))
                        }
                    }).limit(20).sort({addedDate:-1})
                    break
                }
    
                case "공지_30개": {
                    const message = `
                    [ 이전 공지사항 보기 ]
    받고자하는 공지사항의 개수를 선택해주세요.
    
    공지사항은 최근 10, 20, 30개까지 받아보실수있습니다.
                    `
                    bot.editMessageText(message, {
                        chat_id: reqMsg.chat.id, 
                        message_id:reqMsg.message_id,
                        "reply_markup": {},
                    })
                    Gongji.find(async(err, gongji) => {
                        for(let i = gongji.length-1; i >= 0 ; i--){
                            await bot.sendMessage(reqMsg.chat.id, makeMsg(gongji[i]))
                        }
                    }).limit(30).sort({addedDate:-1})
                    break
                }

                case "종료":{
                    const message = `[ 창 닫힘 ]`
                    bot.editMessageText(message, {
                        chat_id: reqMsg.chat.id, 
                        message_id:reqMsg.message_id,
                        "reply_markup": {},
                    })
                    break
                }
            }
        }
    })
})


/*
=================
    테스트 파트
=================
*/


crawl()

// const sendGongji = schedule.scheduleJob("*/30 * * * * *", () => {
//     crawl()
// })

bot.onText(/\/test/, msg => {
    console.log(msg.chat)
    console.log(msg.chat.first_name + msg.chat.last_name);
})