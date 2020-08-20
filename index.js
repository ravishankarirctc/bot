//Webex Bot Starter - featuring the webex-node-bot-framework - https://www.npmjs.com/package/webex-node-bot-framework

var oracledb = require('oracledb');

//local
const dbConfig = require('./localDbConfig.js');
const userTableConfig = require('./localUserTableConfig.js');

//remote
//const userTableConfig = require('./userTableConfig.js');
//const dbConfig = require('./dbConfig.js');

var framework = require('webex-node-bot-framework');
var webhook = require('webex-node-bot-framework/webhook');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser.json());
app.use(express.static('images'));
const config = require("./config.json");

//remote
//const tableauLoginConfig = require("./tableauLoginConfig.json");

//local
const tableauLoginConfig = require("./localTableauLoginConfig.json");

//local
const sqlQueries = require("./local-sql-queries.json");

//remote
//const sqlQueries = require("./sql-queries.json");

//to enable t REST API call
//first install this > npm install node-fetch --save
//const fetch = require('node-fetch');

//to enable the AXIOS API Calls
//npm install axios --save
const axios = require('axios');

//npm install request --save
//const request = require('request');


//remote
//const tableauConfig = require("./tableauConfig.json");

//local
const tableauConfig = require("./localTableauConfig.json");





// init framework
var framework = new framework(config);
framework.start();
console.log("Starting framework, please wait...");

framework.on("initialized", function () {
  console.log("framework is all fired up! [Press CTRL-C to quit]");
});

// A spawn event is generated when the framework finds a space with your bot in it
// If actorId is set, it means that user has just added your bot to a new space
// If not, the framework has discovered your bot in an existing space
framework.on('spawn', (bot, id, actorId) => {
  if (!actorId) {
    // don't say anything here or your bot's spaces will get
    // spammed every time your server is restarted
    console.log(`While starting up, the framework found our bot in a space called: ${bot.room.title}`);
  } else {
    // When actorId is present it means someone added your bot got added to a new space
    // Lets find out more about them..
    var msg = 'You can say `help` to get the list of words I am able to respond to.';
    bot.webex.people.get(actorId).then((user) => {
      msg = `Hello there ${user.displayName}. ${msg}`; 
    }).catch((e) => {
      console.error(`Failed to lookup user details in framwork.on("spawn"): ${e.message}`);
      msg = `Hello there. ${msg}`;  
    }).finally(() => {
      // Say hello, and tell users what you do!
      if (bot.isDirect) {
        bot.say('markdown', msg);
      } else {
        let botName = bot.person.displayName;
        msg += `\n\nDon't forget, in order for me to see your messages in this group space, be sure to *@mention* ${botName}.`;
        bot.say('markdown', msg);
      }
    });
  }
});


//Process incoming messages

let responded = false;
/* On mention with command
ex User enters @botname help, the bot will write back in markdown
*/

framework.hears(/help|what can i (do|say)|what (can|do) you do/i, function (bot, trigger) {
	
	let personEmail = trigger.person.emails[0];
	
	oracledb.getConnection(userTableConfig, function(err, connection) {  
		if (err) {  
		  console.error(err.message);  
		  return;  
		}  
		console.log(sqlQueries.validateUser);
		connection.execute( sqlQueries.validateUser + "'"+personEmail+"' ",  
		[],  
		function(err, result) {  
		  if (err) {  
			   console.error(err.message);  
			   doRelease(connection);  
			   return;  
		  }  
		  console.log(result.rows);
		 
		 if(null != result.rows[0][0] && result.rows[0][0] > 0){
			
			console.log(`someone needs help! They asked ${trigger.text}`);
			responded = true;
			bot.say(`Hello ${trigger.person.displayName}.`)
				.then(() => sendHelp(bot))
				.catch((e) => console.error(`Problem in help hander: ${e.message}`));  
			  
		  }else{
			  bot.say("markdown", `Sorry, You are not an Authorized user.`);
		  }
		  
		  doRelease(connection);  
		});  
	});

	
	
  
});

framework.hears('Thank You', function (bot, trigger) {
  console.log(`Say Good Day.`);
  responded = true;
  
  //testing 
  //app.set('TABLEAU_ACCESS_TOKEN', 'fgdfhfghdghd');
  
  bot.say(`You are welcome, have a good day.`);
  
  //bot.say(app.get('TABLEAU_ACCESS_TOKEN'));
  
  
});


framework.hears('test', function (bot, trigger) {
  console.log(`testing Tableau API`);
  responded = true;
  
  
  
  let isToken = isTokenPresent();
  
  console.log('isToken: ' + isToken);
  
  
  if(isToken){
	  //call get data API
	  getDataAPICall(bot);
  }else{
	  //call set token API
	  //setToken(bot).then( response =>{getDataAPICall(bot);});
	  
	  setToken()
	  .then(data => { getDataAPICall(bot); })
		.catch(err => console.log(err));
	 
	  
	  //call get data API
	  //getDataAPICall(bot);
  }
  
   
    
//app.set('jwtTokenSecret', 'YOUR_SECRET_STRING');
 
  
  //bot.say('Hi');
});


//axios request interceptior
axios.interceptors.request.use((config) => {
	
	console.log('inside request interceptors');
	
	const token = app.get('TABLEAU_ACCESS_TOKEN');
	console.log('OUT SIDE OF IF token in header: ' + token);
	
	if(null != token &&  typeof token !== 'undefined' && token != 'undefined'){
		
		config.headers['X-Tableau-Auth'] = token;
		config.headers['Accept'] = 'application/json';
		
		console.log('token in header: ' + token);
		
	}else{
		config.headers['Content-Type'] = 'application/json';
		
		//getToken();
		
		//config.headers['X-Tableau-Auth'] = app.get('TABLEAU_ACCESS_TOKEN');
		//config.headers['Accept'] = 'application/json';
	}
	
	
	
    return config;
}, (error) => {
	
    return Promise.reject(error);
});



//response interceptor
axios.interceptors.response.use(null, (error) => {
  if (error.config && error.response && error.response.status === 401) {
    return setToken().then((token) => {
      error.config.headers['X-Tableau-Auth'] = token;
	  console.log('inside response interceptors - '+ token);
      return axios.request(error.config);
    });
  }

  return Promise.reject(error);
});



function setToken(){
	
	console.log('inside setToken');
	
	const config = {
        method: 'post',
        url: tableauConfig.tableauBaseUrl + tableauConfig.tableauAPIVersion + '/auth/signin',
		data: tableauLoginConfig
       
		}
	
		return axios(config)
		.then(response =>{
			console.log('Tableau Token: ');
			console.log(response.data.credentials.token);		
			app.set('TABLEAU_ACCESS_TOKEN', response.data.credentials.token);
			
			return response.data.credentials.token;
		})
		
}

function isTokenPresent(){
	console.log('inside isTokenPresent');
	 
	const token = app.get('TABLEAU_ACCESS_TOKEN');
	
	if(null != token &&  typeof token !== 'undefined' && token != 'undefined'){
		return true;
	}else{
		return false;
	}
}

function getDataAPICall(bot){//make it generic by taking the site id and view id dynamically

console.log('inside getDataAPICall');

	const config = {
        method: 'get',
        url: tableauConfig.tableauBaseUrl + tableauConfig.tableauAPIVersion + '/sites/' + tableauConfig.tableauSiteId + '/views/' + tableauConfig.tableauViewId +'/data'
       
		}
	
	   axios(config)
	   .then(response =>{
	  console.log(tableauConfig.tableauBaseUrl + tableauConfig.tableauAPIVersion + '/sites/' + tableauConfig.tableauSiteId + '/views/' + tableauConfig.tableauViewId+'/data');
		//app.set(response.data);
		console.log(response.data);
		
		var str1 = response.data;
		
		var str = str1.split("\n")[1];
		
		console.log(str);
		
		//var arr = str.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
		
		//str = '"10,00,000","70,480",4,2020-07-26 to 2020-08-10';
		
		var arr = str.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
		
		/*
		for (var i = 0; i < arr.length; i++){
			console.log('arr['+i+'] =',arr[i]);

		}
		*/		
		
		
		//bot.say(response.data);
		
		setDealDetails(bot, 'Deals booked for CCIPL', arr[0], arr[1], arr[2], arr[3]);
	 
	   
	   
	  }).catch(err =>{
		console.log(err);
	  })
}








/* On mention with command
ex User enters @botname framework, the bot will write back in markdown
*/
framework.hears('framework', function (bot) {
  console.log("framework command received");
  responded = true;
  bot.say("markdown", "The primary purpose for the [webex-node-bot-framework](https://github.com/jpjpjp/webex-node-bot-framework) was to create a framework based on the [webex-jssdk](https://webex.github.io/webex-js-sdk) which continues to be supported as new features and functionality are added to Webex. This version of the proejct was designed with two themes in mind: \n\n\n * Mimimize Webex API Calls. The original flint could be quite slow as it attempted to provide bot developers rich details about the space, membership, message and message author. This version eliminates some of that data in the interests of efficiency, (but provides convenience methods to enable bot developers to get this information if it is required)\n * Leverage native Webex data types. The original flint would copy details from the webex objects such as message and person into various flint objects. This version simply attaches the native Webex objects. This increases the framework's efficiency and makes it future proof as new attributes are added to the various webex DTOs ");
});

/* On mention with command, using other trigger data, can use lite markdown formatting
ex User enters @botname 'info' phrase, the bot will provide personal details
*/
/*framework.hears('info', function (bot, trigger) {
  console.log("info command received");
  responded = true;
  //the "trigger" parameter gives you access to data about the user who entered the command
  let personAvatar = trigger.person.avatar;
  let personEmail = trigger.person.emails[0];
  let personDisplayName = trigger.person.displayName;
  let outputString = `Here is your personal information: \n\n\n **Name:** ${personDisplayName}  \n\n\n **Email:** ${personEmail} \n\n\n **Avatar URL:** ${personAvatar}`;
  bot.say("markdown", outputString);
});*/


// Buttons & Cards data
let myCardJSON =
{
    "type": "AdaptiveCard",
    "version": "1.0",
    "body": [
        {
            "type": "ColumnSet",
            "id": "columnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": 50,
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "Get Sales Data",
                            "horizontalAlignment": "Center",
                            "wrap": true,
                            "size": "Large",
                            "weight": "Bolder"
                        },
                        {
                            "type": "ActionSet",
                            "actions": [
                                {
                                    "type": "Action.Submit",
                                    "title": "Get India Data",
                                    "data": {
                                        "region": "India"
                                    }
                                },
                                {
                                    "type": "Action.Submit",
                                    "title": "Get Korea Data",
                                    "data": {
                                        "region": "Korea"
                                    }
                                }
                            ],
                            "horizontalAlignment": "Center",
                            "spacing": "Large"
                        }
                    ],
                    "horizontalAlignment": "Center",
                    "verticalContentAlignment": "Center"
                }
            ]
        }
    ],
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
}
/*
framework.hears('Sales', function (bot, trigger) {
  console.log("someone asked for a showCard- Sales data");
  responded = true;
  //let avatar = trigger.person.avatar;

  //cardJSON.body[0].columns[0].items[0].url = (avatar) ? avatar : `${config.webhookUrl}/missing-avatar.jpg`;
  //cardJSON.body[0].columns[0].items[1].text = trigger.person.displayName;
  //cardJSON.body[0].columns[0].items[2].text = trigger.person.emails[0];
  
  
  
  
  bot.sendCard(myCardJSON, 'This is customizable fallback text for clients that do not support buttons & cards');
});
*/

// Buttons & Cards data
let salesDataJSON ={
    "type": "AdaptiveCard",
    "version": "1.0",
    "body": [
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "Id",
                            "horizontalAlignment": "Center",
                            "wrap": true,
                            "size": "Medium",
                            "weight": "Bolder",
                            "color": "Dark"
                        }
                    ]
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "Name",
                            "horizontalAlignment": "Center",
                            "wrap": true,
                            "size": "Medium",
                            "weight": "Bolder",
                            "color": "Dark"
                        }
                    ]
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "spacing": "None",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "Address",
                            "horizontalAlignment": "Center",
                            "wrap": true,
                            "size": "Medium",
                            "weight": "Bolder",
                            "color": "Dark"
                        }
                    ]
                }
            ]
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "stretch",
                    "id": "",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "{id}",
                            "id": "id",
                            "horizontalAlignment": "Center"
                        }
                    ]
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "{name}",
                            "id": "name",
                            "horizontalAlignment": "Center"
                        }
                    ]
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "{address}",
                            "id": "address",
                            "horizontalAlignment": "Center"
                        }
                    ]
                }
            ]
        }
    ],
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
}


let OrderDetailsMenuCCIPLJson = {
    "type": "AdaptiveCard",
    "version": "1.0",
    "body": [
        {
            "type": "TextBlock",
            "text": "Order Details Menu",
            "horizontalAlignment": "Left",
            "weight": "Bolder",
            "color": "Accent",
            "size": "Medium",
            "wrap": true
        },
        {
            "type": "ActionSet",
            "horizontalAlignment": "Left",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Orders booked till date for CCIPL",
                    "data": {
                        "query": "salesLeadTillDateCCIPL"
                    }
                }
            ],
            "spacing": "Small"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Orders booked for this month for CCIPL",
                    "data": {
                        "query": "salesLeadThisMonthCCIPL"
                    }
                }
            ],
            "horizontalAlignment": "Left",
            "spacing": "None"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Orders booked for this quarter for CCIPL",
                    "data": {
                        "query": "salesLeadThisQuarterCCIPL"
                    }
                }
            ],
            "horizontalAlignment": "Left",
            "spacing": "None"
        }
    ],
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
}

let DealsDetailsMenuCCIPLJson = {
    "type": "AdaptiveCard",
    "version": "1.0",
    "body": [
        {
            "type": "TextBlock",
            "text": "Deal Details Menu",
            "horizontalAlignment": "Left",
            "weight": "Bolder",
            "color": "Accent",
            "size": "Medium"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Deals approved till date for US",
                    "data": {
                        "query": "dealsTillDateCCIPL"
                    }
                }
            ],
            "horizontalAlignment": "Left",
            "spacing": "None"
        }
    ],
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
}

let mainMenuJSON = {
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.0",
    "body": [
        {
            "type": "TextBlock",
            "text": "Main Menu",
            "size": "Medium",
            "weight": "Bolder",
            "color": "Accent",
            "horizontalAlignment": "Left"
        },
        {
            "type": "TextBlock",
            "text": "Please select country:",
            "wrap": true
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.ShowCard",
                    "title": "India",
                    "card": {
                        "type": "AdaptiveCard",
                        "body": [
                            {
                                "type": "TextBlock",
                                "text": "What would you like to query about?",
                                "size": "Medium",
                                "wrap": true,
                                "horizontalAlignment": "Left"
                            },
                            {
                                "type": "Input.ChoiceSet",
                                "id": "IndiaOrdersOrDeals",
                                "choices": [
                                    {
                                        "title": "Deals",
                                        "value": "deals"
                                    },
                                    {
                                        "title": "Orders",
                                        "value": "orders"
                                    }
                                ],
                                "spacing": "None",
                                "separator": true,
                                "style": "expanded"
                            }
                        ],
                        "actions": [
                            {
                                "type": "Action.Submit",
                                "title": "OK",
                                "data": {
                                    "region": "India"
                                }
                            }
                        ],
                        "spacing": "None",
                        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
                    }
                },
                {
                    "type": "Action.ShowCard",
                    "title": "US",
                    "card": {
                        "type": "AdaptiveCard",
                        "body": [
                            {
                                "type": "TextBlock",
                                "text": "What would you like to query about?",
                                "size": "Medium",
                                "wrap": true,
                                "horizontalAlignment": "Left"
                            },
                            {
                                "type": "Input.ChoiceSet",
                                "id": "SKoreaOrdersOrDeals",
                                "style": "expanded",
                                "choices": [
                                    {
                                        "title": "Deals",
                                        "value": "deals"
                                    },
                                    {
                                        "title": "Orders",
                                        "value": "orders"
                                    }
                                ],
                                "spacing": "None",
                                "separator": true
                            }
                        ],
                        "actions": [
                            {
                                "type": "Action.Submit",
                                "title": "OK",
                                "data": {
                                    "region": "SKorea"
                                }
                            }
                        ],
                        "spacing": "None",
                        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
                    }
                }
            ],
            "horizontalAlignment": "Left",
            "spacing": "None"
        }
    ]
}

/*
function myAuthorizer(bot, trigger, id) {
  if(trigger.personEmail === 'ravi.s.aditya@gmail.com') {
    return true;
  }
  else if(trigger.personDomain === 'gmail.com') {
    return true;
  }
  else {
    return false;
  }
}
framework.setAuthorizer(myAuthorizer);
*/

framework.hears('hi', function (bot, trigger) {
  console.log("Hi command received");
 // console.log(trigger.data.orgId);
  responded = true;
  //the "trigger" parameter gives you access to data about the user who entered the command
  let personAvatar = trigger.person.avatar;
  let personEmail = trigger.person.emails[0];
  let personDisplayName = trigger.person.displayName;
  
   
	 bot.say("markdown", `Hi **`+personDisplayName+`**,\n\nWelcome to Chatbot. \n\nPlease select from the below options, so that I can assist you further.`)
		.then(() => bot.sendCard(mainMenuJSON, 'Main Menu'))
		.catch((e) => console.error(`Problem in Hi hander: ${e.message}`)); 
		
});

mainMenuButton = {
    "type": "AdaptiveCard",
    "version": "1.0",
    "body": [
        {
            "type": "TextBlock",
            "text": "nodata"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Main Menu",
                    "data": {
                        "mainMenu": true
                    }
                }
            ]
        }
    ],
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
}
USDEquiAmount = {
    "type": "AdaptiveCard",
    "version": "1.0",
    "body": [
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "USD Equivalent Amount:",
                            "horizontalAlignment": "Left",
                            "weight": "Bolder",
                            "wrap": true
                        }
                    ]
                },
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "USDEquiAmount",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                }
            ]
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Main Menu",
                    "data": {
                        "mainMenu": true
                    }
                }
            ]
        }
    ],
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
}

ordersDetail= {
    "type": "AdaptiveCard",
    "version": "1.0",
    "body": [
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "OrderDetailsFor",
                            "horizontalAlignment": "Left",
                            "weight": "Bolder",
                            "wrap": true
                        }
                    ]
                }
            ]
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "No. Of Orders:",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "orderCount",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                }
            ]
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "Total Amount:",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "totalAmount",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "Period:",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "period",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                }
            ]
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Main Menu",
                    "data": {
                        "mainMenu": true
                    }
                }
            ],
            "spacing": "Small"
        }
    ],
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
}

salesLeadTillDateCCIPLResponseJson = {
    "type": "AdaptiveCard",
    "version": "1.0",
    "body": [
        {
            "type": "TextBlock",
            "text": "Total Orders booked till date for CCIPL",
            "weight": "Bolder",
            "color": "Accent",
            "horizontalAlignment": "Left",
            "size": "Medium",
            "wrap": true
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "No. Of Orders: ",
                            "weight": "Bolder",
                            "color": "Dark",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "orderCount",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "Total Amount: ",
                            "weight": "Bolder",
                            "color": "Dark",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "totalAmount",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "Period: ",
                            "weight": "Bolder",
                            "color": "Dark",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "month",
                            "spacing": "None",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ]
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Equivalent USD Amount",
                    "data": {
                        "USDAmnt": "USD"
                    }
                },
                {
                    "type": "Action.ShowCard",
                    "title": "Orders booked for a Customer",
                    "card": {
                        "type": "AdaptiveCard",
                        "body": [
                            {
                                "type": "Input.Text",
                                "id": "custNameInput",
                                "isMultiline": true,
                                "placeholder": "Enter Customer Name"
                            }
                        ],
                        "actions": [
                            {
                                "type": "Action.Submit",
                                "title": "OK",
                                "data": {
                                    "custNameAction": true
                                }
                            }
                        ],
                        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
                    }
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Orders booked for FTWZ",
                    "data": {
                        "FTWZ": "FTWZ"
                    }
                },
                {
                    "type": "Action.Submit",
                    "title": "Orders booked for SLC/DTA",
                    "data": {
                        "SLCDTA": "SLCDTA"
                    }
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Orders booked for P+S",
                    "data": {
                        "PS": "PS"
                    }
                },
                {
                    "type": "Action.Submit",
                    "title": "Service Only booked orders",
                    "data": {
                        "ServiceOnly": "ServiceOnly"
                    }
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Orders booked for Meraki",
                    "data": {
                        "Meraki": "Meraki"
                    }
                }
            ],
            "horizontalAlignment": "Left"
        },
		{
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Main Menu",
                    "data": {
                        "mainMenu": true
                    }
                }
            ],
            "separator": true
        }
    ],
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
}

salesLeadThisMonthCCIPLResponseJson = {
    "type": "AdaptiveCard",
    "version": "1.0",
    "body": [
        {
            "type": "TextBlock",
            "text": "Total Orders booked this month for CCIPL",
            "weight": "Bolder",
            "color": "Accent",
            "horizontalAlignment": "Left",
            "size": "Medium",
            "wrap": true
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "No. Of Orders: ",
                            "weight": "Bolder",
                            "color": "Dark",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "orderCount",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "Total Amount: ",
                            "weight": "Bolder",
                            "color": "Dark",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "totalAmount",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "Period: ",
                            "weight": "Bolder",
                            "color": "Dark",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "month",
                            "spacing": "None",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ]
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Equivalent USD Amount",
                    "data": {
                        "USDAmnt": "ThisMonthUSD"
                    }
                },
                {
                    "type": "Action.ShowCard",
                    "title": "Orders booked for a Customer",
                    "card": {
                        "type": "AdaptiveCard",
                        "body": [
                            {
                                "type": "Input.Text",
                                "id": "custNameInput",
                                "isMultiline": true,
                                "placeholder": "Enter Customer Name"
                            }
                        ],
                        "actions": [
                            {
                                "type": "Action.Submit",
                                "title": "OK",
                                "data": {
                                    "thisMonthCustNameAction": true
                                }
                            }
                        ],
                        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
                    }
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Orders booked for FTWZ",
                    "data": {
                        "FTWZ": "ThisMonthFTWZ"
                    }
                },
                {
                    "type": "Action.Submit",
                    "title": "Orders booked for SLC/DTA",
                    "data": {
                        "SLCDTA": "ThisMonthSLCDTA"
                    }
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Orders booked for P+S",
                    "data": {
                        "PS": "ThisMonthPS"
                    }
                },
                {
                    "type": "Action.Submit",
                    "title": "Service Only booked orders",
                    "data": {
                        "ServiceOnly": "ThisMonthServiceOnly"
                    }
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Orders booked for Meraki",
                    "data": {
                        "Meraki": "ThisMonthMeraki"
                    }
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Main Menu",
                    "data": {
                        "mainMenu": true
                    }
                }
            ],
            "separator": true
        }
    ],
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
}

salesLeadThisQuarterCCIPLResponseJson={
    "type": "AdaptiveCard",
    "version": "1.0",
    "body": [
        {
            "type": "TextBlock",
            "text": "Total Orders booked this quarter for CCIPL",
            "weight": "Bolder",
            "color": "Accent",
            "horizontalAlignment": "Left",
            "size": "Medium",
            "wrap": true
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "No. Of Orders: ",
                            "weight": "Bolder",
                            "color": "Dark",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "orderCount",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "Total Amount: ",
                            "weight": "Bolder",
                            "color": "Dark",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "totalAmount",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "Period: ",
                            "weight": "Bolder",
                            "color": "Dark",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "month",
                            "spacing": "None",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ]
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Equivalent USD Amount",
                    "data": {
                        "USDAmnt": "ThisQuarterUSD"
                    }
                },
                {
                    "type": "Action.ShowCard",
                    "title": "Orders booked for a Customer",
                    "card": {
                        "type": "AdaptiveCard",
                        "body": [
                            {
                                "type": "Input.Text",
                                "id": "custNameInput",
                                "isMultiline": true,
                                "placeholder": "Enter Customer Name"
                            }
                        ],
                        "actions": [
                            {
                                "type": "Action.Submit",
                                "title": "OK",
                                "data": {
                                    "thisQuarterCustNameAction": true
                                }
                            }
                        ],
                        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
                    }
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Orders booked for FTWZ",
                    "data": {
                        "FTWZ": "ThisQuarterFTWZ"
                    }
                },
                {
                    "type": "Action.Submit",
                    "title": "Orders booked for SLC/DTA",
                    "data": {
                        "SLCDTA": "ThisQuarterSLCDTA"
                    }
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Orders booked for P+S",
                    "data": {
                        "PS": "ThisQuarterPS"
                    }
                },
                {
                    "type": "Action.Submit",
                    "title": "Service Only booked orders",
                    "data": {
                        "ServiceOnly": "ThisQuarterServiceOnly"
                    }
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Orders booked for Meraki",
                    "data": {
                        "Meraki": "ThisQuarterMeraki"
                    }
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Main Menu",
                    "data": {
                        "mainMenu": true
                    }
                }
            ],
            "separator": true
        }
    ],
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
}

salesLeadLastYearThisQuarterCCIPLResponseJson = {
    "type": "AdaptiveCard",
    "version": "1.0",
    "body": [
        {
            "type": "TextBlock",
            "text": "Total Orders booked last year this quarter for CCIPL",
            "weight": "Bolder",
            "color": "Accent",
            "horizontalAlignment": "Left",
            "size": "Medium"
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "No. Of Orders: ",
                            "weight": "Bolder",
                            "color": "Dark",
                            "horizontalAlignment": "Left"
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "orderCount",
                            "horizontalAlignment": "Left"
                        }
                    ],
                    "horizontalAlignment": "Left"
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "Total Amount: ",
                            "weight": "Bolder",
                            "color": "Dark",
                            "horizontalAlignment": "Left"
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "totalAmount",
                            "horizontalAlignment": "Left"
                        }
                    ],
                    "horizontalAlignment": "Left"
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "Period: ",
                            "weight": "Bolder",
                            "color": "Dark",
                            "horizontalAlignment": "Left"
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "month",
                            "spacing": "None",
                            "horizontalAlignment": "Left"
                        }
                    ]
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "ActionSet",
                            "actions": [
                                {
                                    "type": "Action.Submit",
                                    "title": "Equivalent USD Amount",
                                    "data": {
                                        "USDAmnt": "LastYearThisQuarterUSD"
                                    }
                                }
                            ],
                            "horizontalAlignment": "Left"
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "ActionSet",
                            "actions": [
                                {
                                    "type": "Action.ShowCard",
                                    "title": "Orders booked for a Customer",
                                    "card": {
                                        "type": "AdaptiveCard",
                                        "body": [
                                            {
                                                "type": "Input.Text",
                                                "id": "custNameInput",
                                                "isMultiline": true,
                                                "placeholder": "Enter Customer Name"
                                            }
                                        ],
                                        "actions": [
                                            {
                                                "type": "Action.Submit",
                                                "title": "OK",
                                                "data": {
                                                    "LastYearThisQuarterCustNameAction": true
                                                }
                                            }
                                        ],
                                        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
                                    }
                                }
                            ],
                            "horizontalAlignment": "Left"
                        }
                    ]
                }
            ]
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "horizontalAlignment": "Left",
                    "items": [
                        {
                            "type": "ActionSet",
                            "actions": [
                                {
                                    "type": "Action.Submit",
                                    "title": "Orders booked for FTWZ",
                                    "data": {
                                        "FTWZ": "LastYearThisQuarterFTWZ"
                                    }
                                }
                            ],
                            "horizontalAlignment": "Left"
                        }
                    ]
                },
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "ActionSet",
                            "actions": [
                                {
                                    "type": "Action.Submit",
                                    "title": "Orders booked for SLC/DTA",
                                    "data": {
                                        "SLCDTA": "LastYearThisQuarterSLCDTA"
                                    }
                                }
                            ],
                            "horizontalAlignment": "Left"
                        }
                    ]
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "horizontalAlignment": "Left",
                    "items": [
                        {
                            "type": "ActionSet",
                            "actions": [
                                {
                                    "type": "Action.Submit",
                                    "title": "Orders booked for P+S",
                                    "data": {
                                        "PS": "LastYearThisQuarterPS"
                                    }
                                }
                            ],
                            "horizontalAlignment": "Left"
                        }
                    ]
                },
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "ActionSet",
                            "actions": [
                                {
                                    "type": "Action.Submit",
                                    "title": "Service Only booked orders",
                                    "data": {
                                        "ServiceOnly": "LastYearThisQuarterServiceOnly"
                                    }
                                }
                            ],
                            "horizontalAlignment": "Left"
                        }
                    ]
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "ActionSet",
                            "actions": [
                                {
                                    "type": "Action.Submit",
                                    "title": "Orders booked for Meraki",
                                    "data": {
                                        "Meraki": "LastYearThisQuarterMeraki"
                                    }
                                }
                            ],
                            "horizontalAlignment": "Left"
                        }
                    ],
                    "horizontalAlignment": "Left"
                }
            ],
            "horizontalAlignment": "Center"
        }
    ],
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
}

tillDateDealsCCIPLResponseJson = {
    "type": "AdaptiveCard",
    "version": "1.0",
    "body": [
        {
            "type": "TextBlock",
            "text": "Total Deals approved till date for CCIPL",
            "weight": "Bolder",
            "color": "Accent",
            "horizontalAlignment": "Left",
            "size": "Medium",
            "wrap": true
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "No. Of Orders: ",
                            "weight": "Bolder",
                            "color": "Dark",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "orderCount",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "Total Amount: ",
                            "weight": "Bolder",
                            "color": "Dark",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "totalAmount",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "Period: ",
                            "weight": "Bolder",
                            "color": "Dark",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ],
                    "horizontalAlignment": "Left"
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "month",
                            "spacing": "None",
                            "horizontalAlignment": "Left",
                            "wrap": true
                        }
                    ]
                }
            ],
            "horizontalAlignment": "Left"
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "ActionSet",
                            "actions": [
                                {
                                    "type": "Action.ShowCard",
                                    "title": "Deals booked for a Customer",
                                    "card": {
                                        "type": "AdaptiveCard",
                                        "body": [
                                            {
                                                "type": "Input.Text",
                                                "id": "custNameInput",
                                                "isMultiline": true,
                                                "placeholder": "Enter Customer Name"
                                            }
                                        ],
                                        "actions": [
                                            {
                                                "type": "Action.Submit",
                                                "title": "OK",
                                                "data": {
                                                    "tillDateDealsCustNameAction": true
                                                }
                                            }
                                        ],
                                        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
                                    }
                                }
                            ],
                            "horizontalAlignment": "Left"
                        }
                    ]
                }
            ]
        },
        {
            "type": "ActionSet",
            "actions": [
                {
                    "type": "Action.Submit",
                    "title": "Main Menu",
                    "data": {
                        "mainMenu": true
                    }
                }
            ],
            "spacing": "Small",
            "separator": true
        }
    ],
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json"
}
//button action using webhook
framework.on('attachmentAction', function (bot, trigger) {

	console.log("someone ckicked on a Action.Button");
		
	let personEmail = trigger.person.emails[0];
	
	
	
		
		let attachmentAction = trigger.attachmentAction;
			console.log(`Got an attachmentAction:\n${JSON.stringify(attachmentAction, null, 2)}`);


			//Main Menu
			if(attachmentAction.inputs.hasOwnProperty('mainMenu') && attachmentAction.inputs.mainMenu){

				bot.say("markdown", `Welcome to Chatbot. \n\nPlease select from the below options, so that I can assist you further.`)
				.then(() => bot.sendCard(mainMenuJSON, 'Main Menu'))
				.catch((e) => console.error(`Problem in help hander: ${e.message}`)); 

			}
			
						
			//S Korea Deal Details Menu
			if(attachmentAction.inputs.hasOwnProperty('region') && attachmentAction.inputs.hasOwnProperty('SKoreaOrdersOrDeals') 
				&& attachmentAction.inputs.region == 'SKorea' && attachmentAction.inputs.SKoreaOrdersOrDeals == 'deals'){

				bot.say("markdown", `Please select from the below options, so that I can assist you further.`)
				.then(() => bot.sendCard(DealsDetailsMenuCCIPLJson, 'Main Menu'))
				.catch((e) => console.error(`Problem in help hander: ${e.message}`)); 

			}		
			
						
						  
			  ///////////////Till date Deals Deatils////////////////////

			//salesLeadTillDateCCIPL
			if(attachmentAction.inputs.query == "dealsTillDateCCIPL"){

				bot.say("markdown", `Sure, let me get those details for you.`)
				.then(() => getTillDateDealsCCIPL(bot))
				.catch((e) => console.error(`Problem in getTillDateDealsCCIPL hander: ${e.message}`) );

			}
			 ////Can you tell me how many deals are booked for Customer A till date
			if(attachmentAction.inputs.hasOwnProperty('tillDateDealsCustNameAction') && attachmentAction.inputs.tillDateDealsCustNameAction){
			 
				let customerName = attachmentAction.inputs.custNameInput;
				  
				bot.say("markdown", `Sure, let me get those details for you.`)
				.then(() => getTillDateCustDeals(bot, customerName))
				.catch((e) => console.error(`Problem in getTillDateCustDeals hander: ${e.message}`));
			 
			}
			
	

    
});


///////#########Till date Deals detail ##############//////////
function getTillDateDealsCCIPL(bot){
		
	//How many deals have been booked till date for CCIPL?
	
	
	const config = {
        method: 'get',
        url: tableauConfig.tableauBaseUrl + tableauConfig.tableauAPIVersion + '/sites/' + tableauConfig.tableauSiteId + '/views/' + tableauConfig.tableauViewId +'/data'
       
		}
	
	   axios(config)
	   .then(response =>{
	  console.log(tableauConfig.tableauBaseUrl + tableauConfig.tableauAPIVersion + '/sites/' + tableauConfig.tableauSiteId + '/views/' + tableauConfig.tableauViewId+'/data');
		//app.set(response.data);
		console.log(response.data);
		
		var str1 = response.data;
		
		var str = str1.split("\n")[1];
		
		console.log(str);
		
		//var arr = str.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
		
		//str = '"10,00,000","70,480",4,2020-07-26 to 2020-08-10';
		
		var arr = str.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
		
		/*
		for (var i = 0; i < arr.length; i++){
			console.log('arr['+i+'] =',arr[i]);

		}
		*/		
		
		
		//bot.say(response.data);
		
		//setDealDetails(bot, 'Deals booked for CCIPL', arr[0], arr[1], arr[2], arr[3]);
		
		//settng the Database response to Card
		  tillDateDealsCCIPLResponseJson.body[1].columns[1].items[0].text = arr[2];
		  tillDateDealsCCIPLResponseJson.body[2].columns[1].items[0].text = arr[1] + '(' + arr[0] + ')';
		  tillDateDealsCCIPLResponseJson.body[3].columns[1].items[0].text = arr[3];
		  
		  bot.sendCard(tillDateDealsCCIPLResponseJson, 'tillDateDealsCCIPLResponse Card');
	 
	   
	   
	  }).catch(err =>{
		console.log(err);
	  })
	
}

			

//View Filter
function getTillDateCustDeals(bot, custNameInput){
	
				
				
			const config = {
        method: 'get',
        url: tableauConfig.tableauBaseUrl + tableauConfig.tableauAPIVersion + '/sites/' + tableauConfig.tableauSiteId + '/views/' + tableauConfig.tableauViewId +'/data?vf_Orders Booked='+custNameInput
       
		}
	
	   axios(config)
	   .then(response =>{
	  console.log(tableauConfig.tableauBaseUrl + tableauConfig.tableauAPIVersion + '/sites/' + tableauConfig.tableauSiteId + '/views/' + tableauConfig.tableauViewId+'/data?vf_Orders Booked='+custNameInput);
		//app.set(response.data);
		console.log(response.data);
		
		var str1 = response.data;
		
		console.log('str1: '+ str1);
		
		var usdAmount;
		var	localAmount;
		var totalDealsCount;
		var period;
		
		if(null != str1 && str1.length > 1 && str1.split("\n").length > 1){
			var str = str1.split("\n")[1];
			
			console.log(str);
			
			//var arr = str.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
			
			//str = '"10,00,000","70,480",4,2020-07-26 to 2020-08-10';
			
			var arr = str.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
			
			if(null != arr){
				usdAmount = arr[0];
				localAmount = arr[1];
				totalDealsCount = arr[2];
				period = arr[3];
			}
		
			
			
			
		}else{
				usdAmount = 'USD 0';
		localAmount = 'INR 0';
		totalDealsCount = '0';
		period = 'No data';
		}
		
		
		/*
		for (var i = 0; i < arr.length; i++){
			console.log('arr['+i+'] =',arr[i]);

		}
		*/		
		
		
		//bot.say(response.data);
		
		//setDealDetails(bot, 'Deals booked for CCIPL', arr[0], arr[1], arr[2], arr[3]);
		//bot, orderDetailHeader, usdAmount, localAmount, totalDealsCount, period
		
		 if(null != arr){
						  
			setDealDetails(bot, `Till date deals details for `+ custNameInput + `: `, usdAmount, localAmount, totalDealsCount, period);
			  
			
			  
		  }else{
			  
			mainMenuButton.body[0].text = `No Deal details for Customer till date.`;
			bot.sendCard(mainMenuButton, 'Main Menu Button');
		 
		  }
	 
	   
	   
	  }).catch(err =>{
		console.log(err);
	  })
		
	
}



function setDealDetails(bot, orderDetailHeader, usdAmount, localAmount, totalDealsCount, period){
	
	//let outputString = `Order Details for ` + forName + `: `;
	
	//start setting data in JSON from here 
	ordersDetail.body[0].columns[0].items[0].text = orderDetailHeader;
	
	ordersDetail.body[1].columns[1].items[0].text = totalDealsCount;	
	ordersDetail.body[2].columns[1].items[0].text = localAmount + '(' + usdAmount + ')';	
	ordersDetail.body[3].columns[1].items[0].text = period;
	
	bot.sendCard(ordersDetail, 'Main Menu Button');	
	
}


/* On mention with bot data 
ex User enters @botname 'space' phrase, the bot will provide details about that particular space
*/
/*framework.hears('space', function (bot) {
  console.log("space. the final frontier");
  responded = true;
  let roomTitle = bot.room.title;
  let spaceID = bot.room.id;
  let roomType = bot.room.type;

  let outputString = `The title of this space: ${roomTitle} \n\n The roomID of this space: ${spaceID} \n\n The type of this space: ${roomType}`;

  console.log(outputString);
  bot.say("markdown", outputString)
    .catch((e) => console.error(`bot.say failed: ${e.message}`));

});
*/
/* 
   Say hi to every member in the space
   This demonstrates how developers can access the webex
   sdk to call any Webex API.  API Doc: https://webex.github.io/webex-js-sdk/api/
*/
/*
framework.hears("say hi to everyone", function (bot) {
  console.log("say hi to everyone.  Its a party");
  responded = true;
  // Use the webex SDK to get the list of users in this space
  bot.webex.memberships.list({roomId: bot.room.id})
    .then((memberships) => {
      for (const member of memberships.items) {
        if (member.personId === bot.person.id) {
          // Skip myself!
          continue;
        }
        let displayName = (member.personDisplayName) ? member.personDisplayName : member.personEmail;
        bot.say(`Hello ${displayName}`);
      }
    })
    .catch((e) => {
      console.error(`Call to sdk.memberships.get() failed: ${e.messages}`);
      bot.say('Hello everybody!');
    });
});
*/
// Buttons & Cards data
let cardJSON =
{
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  type: 'AdaptiveCard',
  version: '1.0',
  body:
    [{
      type: 'ColumnSet',
      columns:
        [{
          type: 'Column',
          width: '5',
          items:
            [{
              type: 'Image',
              url: 'Your avatar appears here!',
              size: 'large',
              horizontalAlignment: "Center",
              style: 'person'
            },
            {
              type: 'TextBlock',
              text: 'Your name will be here!',
              size: 'medium',
              horizontalAlignment: "Center",
              weight: 'Bolder'
            },
            {
              type: 'TextBlock',
              text: 'And your email goes here!',
              size: 'small',
              horizontalAlignment: "Center",
              isSubtle: true,
              wrap: false
            }]
        }]
    }]
};

/* On mention with card example
ex User enters @botname 'card me' phrase, the bot will produce a personalized card - https://developer.webex.com/docs/api/guides/cards
*/
/*
framework.hears('card me', function (bot, trigger) {
  console.log("someone asked for a card");
  responded = true;
  let avatar = trigger.person.avatar;

  cardJSON.body[0].columns[0].items[0].url = (avatar) ? avatar : `${config.webhookUrl}/missing-avatar.jpg`;
  cardJSON.body[0].columns[0].items[1].text = trigger.person.displayName;
  cardJSON.body[0].columns[0].items[2].text = trigger.person.emails[0];
  bot.sendCard(cardJSON, 'This is customizable fallback text for clients that do not support buttons & cards');
});
*/

/* On mention reply example
ex User enters @botname 'reply' phrase, the bot will post a threaded reply
*/
/*
framework.hears('reply', function (bot, trigger) {
  console.log("someone asked for a reply.  We will give them two.");
  responded = true;
  bot.reply(trigger.message, 
    'This is threaded reply sent using the `bot.reply()` method.',
    'markdown');
  var msg_attach = {
    text: "This is also threaded reply with an attachment sent via bot.reply(): ",
    file: 'https://media2.giphy.com/media/dTJd5ygpxkzWo/giphy-downsized-medium.gif'
  };
  bot.reply(trigger.message, msg_attach);
});
*/
/* On mention with unexpected bot command
   Its a good practice is to gracefully handle unexpected input
*/

//framework.hears(/.*/, function (bot, trigger) {
  // This will fire for any input so only respond if we haven't already

  //if (!responded) {
    //console.log(`catch-all handler fired for user input: ${trigger.text}`);
    //bot.say(`Sorry, I don't know how to respond to "${trigger.text}"`)
    //.then(() => sendHelp(bot))
     //.catch((e) => console.error(`Problem in the unexepected command hander: ${e.message}`));
  //}
  //responded = false;
//});

/*
function sendHelp(bot) {
  bot.say("markdown", 'These are the commands I can respond to:', '\n\n ' +
    '1. **framework**   (learn more about the Webex Bot Framework) \n' +
    '2. **info**  (get your personal details) \n' +
    '3. **space**  (get details about this space) \n' +
    '4. **card me** (a cool card!) \n' +
    '5. **say hi to everyone** (everyone gets a greeting using a call to the Webex SDK) \n' +
    '6. **reply** (have bot reply to your message) \n' +
    '7. **help** (what you are reading now)');
}*/

function sendHelp(bot) {
  bot.say("markdown", 'These are the commands I can respond to:', '\n\n ' +
    '1. **Hi**   (To start interaction with me for deals or order data.) \n' +
    '2. **Thank you**  (To end our conversation.) \n');
}


//Server config & housekeeping
// Health Check
/*app.get('/', function (req, res) {
  res.send(`I'm alive....123`);
});*/


app.post('/', webhook(framework));

//by me

/*
app.post('/', function (req, res) {
  res.send(`This is my post response`);
});
*/


////



var server = app.listen(config.port, function () {
  framework.debug('framework listening on port %s', config.port);
});

// gracefully shutdown (ctrl-c)
process.on('SIGINT', function () {
  framework.debug('stoppping...');
  server.close();
  framework.stop().then(function () {
    process.exit();
  });
});

