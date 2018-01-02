// SVG Parameters
let width = 1400;
let height = 800;
let barPadding = 4;

let startDate = 1960;
let endDate = 2017;
let dateRange = [];
for (let y = startDate; y <= endDate; y++) {
    dateRange.push(y);
}

let countryInfoUrl = './data/hnp/HNP_StatsCountry.csv';
let countryInfoJson = './data/map/countries.json';
let dataUrl = './data/hnp/HNP_StatsData.csv';
let seriesUrl = './data/hnp/HNP_StatsSeries.csv';
let mapJsonUrl = '//unpkg.com/world-atlas@1.1.4/world/50m.json';
let mapCountryDataUrl = './data/map/country_data.csv';

let start = new Date();

beginLoading();
buildSvg(width, height);

d3.queue()
  .defer(d3.csv, countryInfoUrl, countryDataFormatter)
  .defer(d3.csv, seriesUrl, seriesInfoFormatter)
  .defer(d3.json, mapJsonUrl)
  .defer(d3.csv, mapCountryDataUrl, countryMapDataFormatter)
  .defer(d3.json, countryInfoJson)
  .await( (error, countryInfo, seriesInfo, mapData, mapCountryData, jsonCountryInfo) => {
    let codeToNameMap = countryInfo.reduce((a, c) => {
        a[c.shortName] = c.countryCode;
        return a;
    }, {});
    let validCodes = getValidCountryCodeSet(countryInfo);
    let countryMap = getCountryDictionary(countryInfo);

    let alphaMap = {};
    let numericMap = {};
    let subRegions = new Set();

    jsonCountryInfo.forEach((i) => {
        alphaMap[i.cca2] = i;
        numericMap[i.ccn3] = i;
        subRegions.add(i.subregion);
    });

    drawMap(mapData, mapCountryData, codeToNameMap, countryMap, numericMap);

    d3.csv(dataUrl,
        dataSeriesFormatter.bind(null, validCodes),
        onDataLoaded.bind(null, countryMap, seriesInfo));
  });

function drawMap(mapData, mapCountryData, codeToNameMap, countryMap, numericMap) {
    let geoData = topojson.feature(mapData, mapData.objects.countries).features;

    geoData.forEach((c) => {
        if (numericMap.hasOwnProperty(c.id)) {
            c.cca3 = numericMap[c.id].cca3;
        }
    });

    let misses = [];
    mapCountryData.forEach((c) => {
        let name = c.country;
        let id = c.id;
        if (codeToNameMap.hasOwnProperty(name)) {
            countryMap[codeToNameMap[name]].mapId = id;
        } else {
            misses.push(name);
        }
    });

    // let colorScale = d3.scaleOrdinal()
    //                    .domain(subRegions)
    //                    .range(d3.schemeCategory20c);

    let projection = d3.geoMercator()
                       .scale((width + 1) / 2 / Math.PI)
                       .translate([width / 2, height / 1.4]);

    let path = d3.geoPath()
                 .projection(projection);

    d3.select('svg')
            .attr('width', width)
            .attr('height', height)
        .selectAll('.country')
        .data(geoData)
        .enter()
            .append('path')
            .classed('country', true)
            .attr('d', path)
            .attr('fill', 'gray');
            // .attr('fill', (d) =>{
            //     if (d.id in numericMap) {
            //         return colorScale(numericMap[d.id].subregion);
            //     } else {
            //         return 'black';
            //     }
            // });
}

function onDataLoaded(countryMap, seriesInfo, error, data) {
    let collectedData = getCollectedData(seriesInfo, data);

    // let dataVisualizerStrategy = setGraphForYear.bind(null,
    //     collectedData, countryMap, width, height, barPadding);

    let dataVisualizerStrategy = setMapForYear.bind(null, collectedData, countryMap);

    buildSelectors(seriesInfo, collectedData, dataVisualizerStrategy);

    d3.select('#loading-msg').remove();
}

function getCountryDictionary(countryInfo) {
    let countryMap = {};
    for (let i = 0; i < countryInfo.length; i++) {
        countryMap[countryInfo[i].countryCode] = {
            shortName: countryInfo[i].shortName,
            longName: countryInfo[i].longName,
            region: countryInfo[i].region,
        };
    }
    return countryMap;
}

function getValidCountryCodeSet(countryInfo) {
    return countryInfo.reduce( (a, c) => {
        a.add(c.countryCode);
        return a;
    }, new Set());
}

function getCollectedData(seriesInfo, data) {
    let collectedData = {};
    seriesInfo.forEach((code) => {
        collectedData[code.seriesCode] = {
            indicatorName: code.indicatorName,
        };
        dateRange.forEach((year) => {
            collectedData[code.seriesCode][year] = {};
        });
    });

    data.forEach((row) => {
        if (Object.keys(row).length > 0) {
            for (let key in row.data) {
                if (row.data.hasOwnProperty(key)) {
                    collectedData[row.indicatorCode][key][row.countryCode] = row.data[key];
                }
            }
        }
    });

    for (let code in collectedData) {
        if (collectedData.hasOwnProperty(code)) {
            let years = [];
            for (let year in collectedData[code]) {
                if (Object.keys(collectedData[code][year]).length === 0) {
                    delete collectedData[code][year];
                } else if (Number.isInteger(+year)) {
                    years.push(year);
                }
            }
            collectedData[code].validYears = years;
        }
    }
    return collectedData;
}

function buildSvg(width, height) {
    d3.select('svg')
        .attr('width', width)
        .attr('height', height);
}

function buildGraph(svgWidth, svgHeight, barPadding, finalData) {
    let numBars = finalData.length;
    let minData = d3.min(finalData, (d) => +d.seriesValue) * 0.8;
    let maxData = d3.max(finalData, (d) => +d.seriesValue) * 1.2;
    let yScale = d3.scaleLinear()
                   .domain([minData, maxData])
                   .range([svgHeight, 0]);
    let yearExtent = d3.extent(finalData, (d) => +d.latestYear);
    let colorScale = d3.scaleLinear()
                       .domain([0, 60])
                       .range(['green', 'black']);
    let barWidth = svgWidth / numBars - barPadding;

    finalData.sort( (a, b) => {
        return +a.seriesValue - +b.seriesValue;
    });

    let update = d3.select('svg')
        .selectAll('rect')
        .data(finalData, (d) => d.countryCode);

    update.exit().remove();

    let newRects = update
        .enter()
        .append('rect')
            .attr('width', barWidth)
            .attr('x', (d, i) => (barWidth + barPadding) * i)
            .attr('y', (d) => yScale(d.seriesValue))
            .attr('height', (d) => svgHeight - yScale(d.seriesValue))
            .attr('fill', (d) =>{
                let age = +yearExtent[1] - +d.latestYear;
                return colorScale(+age);
            });

    update
        .attr('width', barWidth)
        .transition()
        .attr('x', (d, i) => (barWidth + barPadding) * i)
        .attr('fill', (d) => colorScale(yearExtent[1] - +d.latestYear))
        .attr('y', (d) => yScale(d.seriesValue))
        .attr('height', (d) => svgHeight - yScale(d.seriesValue));
}

function buildSelectors(seriesInfo, collectedData, dataVisualizerStrategy) {
    d3.select('body')
        .append('div')
            .classed('form-group', true)
            .attr('id', 'selectors');


    let seriesSelector = d3.select('#series-select');

    yearOptions = d3.select('#year-select');

    seriesSelector
        .selectAll('option')
        .data(seriesInfo)
        .enter()
        .append('option')
            .text( (d) => d.indicatorName)
            .property('value', (d) => d.seriesCode);

    seriesSelector
        .on('input', () => {
            setYears(collectedData);
            dataVisualizerStrategy();
        });

    yearOptions
        .on('input', dataVisualizerStrategy);

    d3.select('#log-scale').on('change', dataVisualizerStrategy);

    setYears(collectedData);
    dataVisualizerStrategy();

    d3.select('#selectors').style('display', 'block');
}

function getDataForSelectedYear(collectedData, countryMap, asDict=false) {
    let seriesSelector = d3.select('#series-select');
    let selectedYear = +(d3.select('#year-select')).property('value');
    let selectedSeries = seriesSelector.property('value');
    console.log(`Data for year ${selectedYear}`);
    return asDict
        ? getSeriesDict(collectedData, countryMap,
            selectedSeries, selectedYear)
        : buildSeriesData(collectedData,
            countryMap, selectedSeries, selectedYear);
}

function setGraphForYear(collectedData, countryMap, width, height, barPadding) {
    let finalData = getDataForSelectedYear(collectedData, countryMap);
    buildGraph(width, height, barPadding, finalData);
}

function setMapForYear(collectedData, countryMap) {
    let finalData = getDataForSelectedYear(collectedData, countryMap, true);

    console.log(finalData);
    let seriesArray = [];
    for (let d in finalData) {
        if (finalData.hasOwnProperty(d)) {
            seriesArray.push(+(finalData[d].seriesValue));
        }
    }
    let seriesExtents = d3.extent(seriesArray, (d) => d);
    seriesArray = seriesArray.sort((a, b) => a - b);
    console.log(seriesArray);

    let colorScale = d3.select('#log-scale').property('checked')
        ? d3.scaleLog()
        : d3.scaleLinear();
    colorScale = colorScale
                    .domain(seriesExtents)
                    .range(['#AB3428', '#3B8EA5']);
    let borderColorScale = d3.scaleLog()
                             .domain(seriesExtents)
                             .range(['#F49E4C', '#3B8EA5']);
    console.log(seriesExtents);

    d3.select('svg')
        .selectAll('.country')
        .transition()
        .attr('fill', (d) =>{
            if (finalData.hasOwnProperty(d.cca3)) {
                let data = +(finalData[d.cca3].seriesValue);
                let color = colorScale(data);
                return color;
            } else {
                return 'black';
            }
        })
        .attr('stroke', (d) => {
            if (d.cca3 in finalData) {
                let color = borderColorScale(+(finalData[d.cca3].seriesValue));
            } else {
                return '#ccc';
            }
        });
}

function setYears(collectedData) {
    let selected = d3.select('#series-select').property('value');
    let yearOptions = d3.select('#year-select');
    yearOptions.selectAll('option').remove();
            yearOptions
                .selectAll('option')
                .data(collectedData[selected].validYears)
                .enter()
                .append('option')
                    .text( (d) => d)
                    .property('value', (d) => d);
}

function getSeriesDict(fullData, countries, seriesId, year) {
    let seriesData = {};
    for (let i = 0; i < dateRange.length; i++) {
        let dataYear = dateRange[i];
        let data = fullData[seriesId][dataYear];
        for (country in data) {
            if (data.hasOwnProperty(country)) {
                seriesData[country] = {
                    seriesValue: data[country],
                    latestYear: dataYear,
                    countryInfo: countries[country],
                };
            }
        }
        if (dataYear === +year) {
            break;
        }
    }
    return seriesData;
}

function buildSeriesData(fullData, countries, seriesId, year) {
    let seriesData = getSeriesDict(fullData, countries, seriesId, year);

    let dataArray = [];
    for (entry in seriesData) {
        if (seriesData.hasOwnProperty(entry)) {
            dataArray.push( {
                countryCode: entry,
                countryInfo: countries[entry],
                seriesValue: seriesData[entry].seriesValue,
                latestYear: seriesData[entry].latestYear,
            });
        }
    }
    return dataArray;
}

function dataSeriesFormatter(validCountries, row, i, headers) {
    if (!validCountries.has(row['Country Code'])) return;
    let rowObj = {
        countryCode: row['Country Code'],
        indicatorCode: row['Indicator Code'],
        data: {},
    };
    for (let i = 4; i < headers.length; i++) {
        if (row[headers[i]] !== '') {
            rowObj.data[headers[i]] = row[headers[i]];
        }
    }
    return rowObj;
}

function seriesInfoFormatter(row, i, headers) {
    return {
        seriesCode: row['Series Code'],
        indicatorName: row['Indicator Name'],
        definition: row['Short definition'],
    };
}

function countryDataFormatter(row, i, headers) {
    if (row['Region'] === '') return;

    return {
        countryCode: row['Country Code'],
        shortName: row['Short Name'],
        longName: row['Long Name'],
        region: row['Region'],
    };
}

function countryMapDataFormatter(row) {
    return {
        country: row.country,
        countryCode: row.countryCode,
        population: +row.population,
        medianAge: +row.medianAge,
        fertilityRate: +row.fertilityRate,
        populationDensity: +row.population / +row.landArea,
    };
}

function beginLoading() {
    d3.select('#selectors').style('display', 'none');
    d3.select('body')
        .append('p')
            .attr('id', 'loading-msg')
            .text(`Loading data from ${dataUrl}...`);
}
