"use strict";

const AWS = require('aws-sdk');
AWS.config.update({
    region: process.env.Region
});
const pinpoint = new AWS.Pinpoint();
const lex = new AWS.LexRuntime();

var AppId = process.env.PinpointApplicationId;
var BotName = process.env.BotName;
var BotAlias = process.env.BotAlias;

const darkSkyService = new AWS.Service({
  endpoint: 'https://api.darksky.net/',
  convertResponseTypes: false,
  apiConfig: {
    metadata: {
      protocol: 'rest-json'
    },
    operations: {
      GetForecast: {
        http: {
          method: 'GET',
          requestUri:
            '/forecast/{apiKey}/{targetCoords}' +
            '?exclude=minutely,hourly'
        },
        input: {
          type: 'structure',
          required: ['apiKey', 'targetCoords'],
          members: {
            apiKey: {
              type: 'string',
              location: 'uri',
              locationName: 'apiKey'
            },
            targetCoords: {
              type: 'string',
              location: 'uri',
              locationName: 'targetCoords'
            }
          }
        }
      }
    }
  }
});

const apifyService = new AWS.Service({
  endpoint: 'https://api.apify.com/v2/',
  convertResponseTypes: false,
  apiConfig: {
    metadata: {
      protocol: 'rest-json'
    },
    operations: {
      getMeadowsStatus: {
        http: {
          method: 'GET',
          requestUri:
            'actor-tasks/jomogalla~meadows-task/runs/last/dataset/items?token={apiKey}'
        },
        input: {
          type: 'structure',
          required: ['apiKey'],
          members: {
            apiKey: {
              type: 'string',
              location: 'uri',
              locationName: 'apiKey'
            },
          }
        }
      }
    }
  }
});

const getForecast = (coords) => {
  return new Promise((resolve, reject) => {
    darkSkyService.getForecast(
      {
        apiKey: process.env.DARKSKY_API_KEY,
        targetCoords: coords,
      },
      (error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      }
    );
  });
};

const getMeadowsStatus = () => {
 return new Promise((resolve, reject) => {
    apifyService.getMeadowsStatus(
      {
        apiKey: process.env.apify_api_key,
      },
      (error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      }
    );
  }); 
};

exports.handler = (event, context)  => {
    /*
    * Event info is sent via the SNS subscription: https://console.aws.amazon.com/sns/home
    * 
    * - PinpointApplicationId is your Pinpoint Project ID.
    * - BotName is your Lex Bot name.
    * - BotAlias is your Lex Bot alias (aka Lex function/flow).
    */
    console.log('Received event: ' + event.Records[0].Sns.Message);
    var message = JSON.parse(event.Records[0].Sns.Message);
    var customerPhoneNumber = message.originationNumber;
    var chatbotPhoneNumber = message.destinationNumber;
    var response = message.messageBody.toLowerCase();
    var userId = customerPhoneNumber.replace("+1", "");

    var params = {
        botName: BotName,
        botAlias: BotAlias,
        inputText: response,
        userId: userId
    };
    
    handleOptionSelection(response, options).then((response) => {
      if(response !== '') {
        sendResponse(customerPhoneNumber, chatbotPhoneNumber, response);
      }
    });
};

function sendResponse(custPhone, botPhone, response) {
    var paramsSMS = {
        ApplicationId: AppId,
        MessageRequest: {
            Addresses: {
                [custPhone]: {
                    ChannelType: 'SMS'
                }
            },
            MessageConfiguration: {
                SMSMessage: {
                    Body: response,
                    MessageType: "TRANSACTIONAL",
                    OriginationNumber: botPhone
                }
            }
        }
    };
    pinpoint.sendMessages(paramsSMS, function (err, data) {
        if (err) {
            console.log("An error occurred.\n");
            console.log(err, err.stack);
        }
        else if (data['MessageResponse']['Result'][custPhone]['DeliveryStatus'] != "SUCCESSFUL") {
            console.log("Failed to send SMS response:");
            console.log(data['MessageResponse']['Result']);
        }
        else {
            console.log("Successfully sent response via SMS from " + botPhone + " to " + custPhone);
        }
    });
}

/**
 * CUSTOM CODE TIME
 *
 */
const options = {
    meadows: '45.32931054214441,-121.66508674621582',
    timberline: '45.327943, -121.712462',
    bachelor: '43.991392, -121.678765',
    baker: '48.858770, -121.672139',
    'mission ridge': '47.284297, -120.409521',
    help: '',
};

const options2 = {
    meadows: {
        names: ['meadows'],
        forecastCoords: '45.32931054214441,-121.66508674621582',
        visible: true,
        wasSelected: optionWasSelected,
        modifiers: {
            none: () => getForecast,
            lifts: () => {},
            parking: () => {},
        },
    },
    timberline: {
      forecastCoords: '45.327943, -121.712462',
    },
    bachelor: {
      forecastCoords: '43.991392, -121.678765',
    },
    baker: {
      forecastCoords: '48.858770, -121.672139',
    },
    'mission ridge': {
      forecastCoords: '47.284297, -120.409521'
    },
    help: '',
    menu: {
        visible: false,
    },
};

const hiddenOptions = ['test'];

function handleOptionSelection(message, options) {
    return new Promise((resolve, reject) => {
        // If an option was selected, get the response for it.
        if(optionWasSelected(message, options)) {
            // Help was Selected
            if(helpWasSelected(message)) {
                resolve(getHelpResponse());
            } else if(parkingWasSelected(message)) {
                getMeadowsStatus().then((response) => {
                    const parkingLotStatus = getParkingLotStatus(response[0]);
                    
                    resolve(parkingLotStatus);
                });
                
            } else if(liftsWasSelected(message)) {
                getMeadowsStatus().then((response) => {
                    const liftStatus = getLiftStatus(response[0]);
                    
                    resolve(liftStatus);
                });
                
            } else {
                const coords = getCoordsFromMessage(message, options);

                getForecast(coords).then((response) => {
                    // Tomorrow was selected
                    if(tomorrowWasSelected(message)) {
                        const tomorrowForecast = getDayForecast(response.daily.data[1]);

                        resolve(tomorrowForecast);
                    // Weekend was selected
                    } else if(weekendWasSelected(message)) {

                    // Defualt to Today
                    } else {
                        const currentConditions = getCurrentConditions(response);
                        const dayForecast = getDayForecast(response.daily.data[0]);

                        resolve(currentConditions + dayForecast);
                    }
                });
            }

        // Otherwise, return the menu
        } else {
            resolve(getMenuResponse(options));
        }
    });
}

/* GETTERS */
function getMenuResponse(options) {
    let response = "Welcome to TorCast™\n";
    response += "Options:\n";
    
    let counter = 1;
    for(const key in options) {
        //response += `${counter}: ${key}\n`;
        response += `- ${key}\n`;
        counter++;
    }

    return response;
}

function getTestResponse() {
    let testResponse = '';
    testResponse += 'testing me, huh?';
    
    
    
    return testResponse;
}

function getHelpResponse() {
    // this is a reserved word in Pinpoint, and is managed there :(
    let helpMenu = '';
    
    // helpMenu += `** Help **\n`;
    // helpMenu += `Reply w/ a resort in options to get the forecast\n`;
    // helpMenu += `Ex: 'baker'\n`;
    // helpMenu += `Reply w/ anything else to get the menu\n`;
    // helpMenu += `* Modifiers *\n`;
    // helpMenu += `- tomorrow\n`;
    // helpMenu += `Ex: 'baker tomorrow'\n`;

    return helpMenu;
}

function getDayForecast(dailyForecast) {
    const dayForecast = convertDailyInfoFromForecast(dailyForecast);
    let forecast = '';

    forecast += `== ${convertDateToString(dayForecast.date)} ==\n`;
    forecast += `${dayForecast.daySummary}\n`;
    forecast += `Temp: ${dayForecast.low}-${dayForecast.high}°F\n`;
    forecast += `Wind: ${dayForecast.windSpeed}MPH Gusts: ${dayForecast.windGust}MPH\n`;
    forecast += `Precip: ${dayForecast.precipAccumulation}"/${dayForecast.precipType}\n`;

    return forecast;
}

function getCurrentConditions(forecast) {
    const currentConditions = convertCurrentConditionsFromForecast(forecast);

    return `${currentConditions.summary} | ${currentConditions.temperature}°F | ${currentConditions.windSpeed}MPH\n`
}

function getParkingLotStatus(status) {
  console.log(status);
    var parkingLotStatusResponse = '';
    
    parkingLotStatusResponse += 'Parking Lot Statuses:\n';
    status.parkingLots.forEach((parkingLot) => {
      parkingLotStatusResponse += `${parkingLot.name}: ${parkingLot.status}\n`;
    });
    
    return parkingLotStatusResponse;
};

function getLiftStatus(status) {
    var liftStatusResponse = '';
    
    liftStatusResponse += 'Lift Statuses:\n';
    status.lifts.forEach((lift) => {
      liftStatusResponse += `${lift.name}: ${lift.status}\n`;
    });
    
    return liftStatusResponse;
}


/* CONVERTERS */
function convertCurrentConditionsFromForecast(forecast) {
    const currently = forecast.currently;

    const currentConditions = {
        summary: currently.summary,
        temperature: currently.temperature.toFixed(0),
        apparentTemperature: currently.apparentTemperature.toFixed(0),
        windSpeed: currently.windSpeed.toFixed(0),
    };

    return currentConditions;
}

function convertDailyInfoFromForecast(dailyForecast) {
    const dailyInfo = {
        date: convertEpochToLocalDateTime(dailyForecast.time),
        daySummary: dailyForecast.summary,
        high: dailyForecast.temperatureMax.toFixed(0),
        low: dailyForecast.temperatureMin.toFixed(0),
        uvHigh: dailyForecast.uvIndex,
        windSpeed: dailyForecast.windSpeed.toFixed(0),
        windGust: dailyForecast.windGust.toFixed(0),
        precipType: dailyForecast.precipType,
        precipAccumulation: dailyForecast.precipAccumulation,
    };

    return dailyInfo;
}

function getCoordsFromMessage(message, options) {
    let coords = '';
    optionsKeys(options).forEach((option) => {
        if(message.includes(option)) {
            coords = options[option];
        }
    });

    return coords;
}

function convertDateToString(date) {
  return date.toDateString();
}

function convertEpochToLocalDateTime(epoch) {
  return new Date(epoch * 1000);
}

/* HELPERS */
function optionWasSelected(message, options) {
    const trimmedMessage = message.trim();

    let selected = false;

    
    optionsKeys(options).forEach((option) => {
        if (trimmedMessage.includes(option)) {
            selected = true;
        }
    });
    
    hiddenOptions.forEach((option) => {
        if (trimmedMessage.includes(option)) {
            selected = true;
        }
    });

    return selected;
}

function helpWasSelected(message) {
    return message.includes('help');
}

function testWasSelected(message) {
    return message.includes('test');
}

function liftsWasSelected(message) {
    return message.includes('lifts');
}

function parkingWasSelected(message) {
    return message.includes('parking');
}

function tomorrowWasSelected(message) {
    return message.includes('tomorrow');
}

function weekendWasSelected(message) {

}

function optionsKeys(options) {
    return Object.keys(options);
}
// code borrowed from : https://github.com/tyler-tm/weathernote/blob/master/index.js


    // SET UP WITH LEX
    // response = lex.postText(params, function (err, data) {
    //     if (err) {
    //         console.log(err, err.stack);
    //         //return null;
    //     }
    //     else if (data != null && data.message != null) {
    //         console.log("Lex response: " + data.message);
            
    //         const textResponse = response.response.data.message;
            
    //         sendResponse(customerPhoneNumber, chatbotPhoneNumber, textResponse);
    //     }
    //     else {
    //         console.log("Lex did not send a message back!");
    //     }
    // });