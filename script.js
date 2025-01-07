function log(obj, toggle) {
    if (toggle) {
        console.log(obj)
    }
    return
}

function intersect(setA, setB, ...args) {
    const result = new Set([...setA].filter((i) => setB.has(i)))
    if (args.length === 0) return result
    return intersect(result, args.shift(), ...args)
}

/**
 * Pad a Number [num] with zeroes such that it is [len] characters long.
 */
function zfill(num, len) {
    return num.toString().padStart(len, "0");
}

/**
 * Is true iff the [countyFIPS] is a member of the state listed by [stateFIPS].
 */
function inState(countyFIPS, stateFIPS) {
    return zfill(parseInt(Math.floor(countyFIPS / 1000)), 2) === stateFIPS;
}

// Load the data
d3.csv("ewx_fog_daily.csv", d3.autoType).then(function(data) {
    const print = false;
    log(data, print);

    function station_subset(stn) {
        /**
        Return the subset of the data belonging to station stn.
        **/
        var stationData = data.filter((obj) => {
            return obj["station"] === stn;
        });
        return stationData
    }

    /**
		DATA INITIALIZATION
    **/
    // Default initialization behavior...
    // Dict of stations and their locations
    var stations = []

    // Array of station IDs
    var stns = [...new Set(data.map(item => item["station"]))];
    log(stns, print)

    stns.forEach(function(stn) {
        const fob = data.find(function(ob) {
            if (ob["station"] === stn) {
                return ob;
            }
        })
        stations.push({
            "stn": stn,
            "lon": fob["lon"],
            "lat": fob["lat"]
        })
        log({
            "station": fob["station"],
            "lon": fob["lon"],
            "lat": fob["lat"]
        }, print);
    });
    log(stations, print)

    // Dates to composite over
    var dates = new Set(data.map(d => d.date.toISOString().substring(0, 10)));
    const datesAll = new Set(data.map(d => d.date.toISOString().substring(0, 10)));
    console.log('All dates:', dates);

    /** PLOT INIT **/
    // set the dimensions and margins of the graph
    var margin = {
        top: 10,
        right: 30,
        bottom: 50,
        left: 60
    }
    const width = 850 - margin.left - margin.right
    const height = 600 - margin.top - margin.bottom;

    var svg = d3.select("#plot")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform",
            "translate(" + margin.left + "," + margin.top + ")");

    const geoGroup = svg.append("g").attr("class", "geography")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    const outlineGroup = svg.append("g").attr("class", "outline")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    const contourGroup = svg.append("g").attr("class", "contours")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    const metarGroup = svg.append("g").attr("class", "site")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    const FIPSEWX = [
        '48465', '48137', '48385', '48265', '48019', '48171', '48259', '48031',
        '48299', '48053', '48491', '48287', '48453', '48021', '48149', '48177',
        '48187', '48177', '48285', '48123', '48493', '48255', '48013', '48029',
        '48091', '48325', '48163', '48463', '48271', '48323', '48507', '48127',
        '48209', '48039', '48273'
    ]

    // Plot map
    const generateViz = async function() {
        // Geometries
        const stateID = "48"
        const us = await d3.json("counties-10m.json");
        let states = topojson.feature(us, us.objects.states);
        states.features = states.features.filter(function(a) {
            return a.id === stateID
        });
        let counties = topojson.feature(us, us.objects.counties);
        counties.features = counties.features.filter(function(a) {
            return (inState(a.id, stateID) && FIPSEWX.includes(a.id))
        }); // filter counties
        projection = d3.geoAlbersUsa().fitSize([width, height], counties);
        let path = d3.geoPath().projection(projection);
        let countiesMesh = topojson.mesh(us, us.objects.counties, function(a, b) {
            return inState(a.id, stateID) || inState(b.id, stateID);
        });

        geoGroup.selectAll("path.state").data(states.features)
            .join("path")
            .attr("class", "state")
            .attr("fips", d => d.id)
            .attr("d", path);

        geoGroup.selectAll("path.county").data(counties.features)
            .join("path")
            .attr("class", "county")
            .attr("fips", d => d.id)
            .attr("sites", d => d.sites)
            .attr("d", path);

        outlineGroup.append("path").datum(countiesMesh)
            .attr("class", "outline")
            .attr("d", path);

        stations.forEach(e => {
            e.position = projection([e.lon, e.lat])
        });

        const textMargin = 8
        metarGroup.selectAll("text").data(stations)
            .enter()
            .append('text')
            .attr("class", "textStation")
            .attr("x", d => d.position[0])
            .attr("y", d => d.position[1])
            .attr("dx", textMargin)
            .text(d => d.stn)

        metarGroup.append('text')
            .attr('x', -100).attr('y', 500)
            .attr('fill', 'cyan')
            .attr('font-size', 16).text('Days in database:');

        function getDates() {
            /** Get the set of dates to composite over **/
            let dates = []

            stations.forEach((station) => {
                if (['fog', 'dense'].includes(station.mode)) {
                    let mode = station.mode
                    var stn = station.stn
                    let filtered = station_subset(stn).filter((obj) => {
                        if (mode === 'fog') {
                            return obj['peakfog'] >= 3;
                        } else if (mode === 'dense') {
                            return obj['peakfog'] >= 5;
                        } else {
                            return true;
                        }
                    });
                    dates.push(new Set(filtered.map(s => s.date.toISOString().substring(0, 10))))
                }
            });

            if (dates.length > 1) {
                dates = intersect.apply(this, dates)
            } else if (dates.length == 1) {
                dates = dates[0];
            } else {
                dates = datesAll;
            }
            return dates;
        }


        function updatePlot() {
            /**
            	Run every time the plot needs to be updated
            **/

            // Get selection options
            var showDense = d3.select("#sel-dense").node().checked;
            var fogThresh = showDense ? 5 : 3;
            var selSeason = d3.select('#season').node().selectedOptions[0].value;
            var months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
            switch (selSeason) {
                case "sel-djf":
                    months = [11, 0, 1];
                    break;
                case "sel-mam":
                    months = [2, 3, 4];
                    break;
                case "sel-jja":
                    months = [5, 6, 7];
                    break;
                case "sel-son":
                    months = [8, 9, 10];
                    break;
                default:
                    break;
            }
            console.log('Selected months:', months);

            var dates = getDates();
            // Filter down dates
            dates = new Set(Array.from(dates).filter((d) => {
            	return (months.includes((new Date(d)).getMonth()));
            }));


            console.log('Dates to composite:', dates);

            d3.select('text#numDays').remove();
            metarGroup.append('text')
            	.attr('id', 'numDays')
                .attr('x', -100).attr('y', 530)
                .attr('fill', 'cyan')
                .attr('font-size', 30).text(dates.size + " days");


            // Compute fractions
            stations.forEach((station) => {
                var stn = station.stn
                var stationData = station_subset(stn).filter((obj) => {
                    return (dates.has(obj["date"].toISOString().substring(0, 10)))
                })
                var totalCount = stationData.length
                var fogCount = stationData.filter((obj) => {
                    return (obj["peakfog"] >= fogThresh);
                }).length;
                var temp = stations.find((s) => {
                    return s.stn === stn;
                });
                temp['val'] = fogCount / totalCount
            })

            let minMax = d3.extent(stations.map(s => s.val));
            let colorScale = d3.scaleSequential(d3.interpolateYlGnBu)
                .domain([0, 0.6])
                .clamp(true);


            metarGroup.selectAll("text.textVal").data(stations).join(
                function(enter) {
                    return enter.append('text')
                        .attr("class", "textVal")
                        .attr("x", d => d.position[0])
                        .attr("y", d => d.position[1])
                        .attr("dx", textMargin)
                        .attr("dy", 10)
                        .text(d => (parseFloat(d.val) * 100).toFixed(0) + '%')
                },
                function(update) {
                    return update
                        .text(d => (parseFloat(d.val) * 100).toFixed(0) + '%')
                }
            )

            // Plot circles
            metarGroup.selectAll("circle").data(stations).join(
                function(enter) {
                    return enter.append("circle")
                        .attr("class", "site-none")
                        .attr("cx", d => d.position[0])
                        .attr("cy", d => d.position[1])
                        .attr("r", 8)
                        .attr("stn", d => d.stn)
                        .attr("val", d => d.val)
                        .attr("fill", d => colorScale(d.val))
                        .on("click", function() {
                            let currClass = d3.select(this).attr("class");
                            let stn = d3.select(this).attr("stn");
                            let targetClass = ""
                            if (currClass === "site-none") {
                                targetClass = "fog"
                            } else if (currClass === "site-fog") {
                                targetClass = "dense"
                            } else if (currClass === "site-dense") {
                                targetClass = "none"
                            }

                            d3.select(this).attr("class", `site-${targetClass}`)
                            let temp = stations.find((s) => {
                                return s.stn === stn;
                            });
                            temp['mode'] = targetClass;
                            updatePlot()
                        });
                },
                function(update) {
                    return update
                        .attr("val", d => d.val)
                        .attr("fill", d => colorScale(d.val));
                }
            )

        }

        updatePlot();
        d3.select("#sel-fog").on("input", updatePlot)
        d3.select("#sel-dense").on("input", updatePlot)
        d3.select("#season").on("input", updatePlot)
    }

    generateViz()

});