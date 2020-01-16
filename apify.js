function pageFunction(context) {
    var $ = context.jQuery;
    var req = context.request;
    var result = null;

    var lifts = [];

    var liftOperations = $('#lifts .lift-operations table');

    liftOperations.each(function () {
        $(this).find("tr").each(function (index) {
            if (index === 0) {
                return;
            }

            var row = $(this);

            var statusClass = 'status-status';
            var nameClass = 'status-name';
            var scheduleClass = 'status-schedule';
            var commentsClass = 'status-comments';

            var lift = {};

            lift.status = row.find("td." + statusClass).text();
            lift.name = row.find("td." + nameClass).text();
            lift.schedule = row.find("td." + scheduleClass).text();
            lift.comments = row.find("td." + commentsClass).text();
            
            lifts.push(lift);
        });
    });

    var parkingLots = [];

    var parkingLotDiv = $('#lifts .parking-lots table');

    parkingLotDiv.each(function () {
        $(this).find("tr").each(function (index) {
            if (index === 0) {
                return;
            }

            var row = $(this);

            var statusClass = 'status-status';
            var nameClass = 'status-name';
            var scheduleClass = 'status-schedule';

            var parkingLot = {};

            parkingLot.status = row.find("td." + statusClass).text();
            parkingLot.name = row.find("td." + nameClass).text();
            parkingLot.schedule = row.find("td." + scheduleClass).text();

            parkingLots.push(parkingLot);
        });
    });

    result = {
        lifts: lifts,
        parkingLots: parkingLots
    };

    return result ? result : {};
}