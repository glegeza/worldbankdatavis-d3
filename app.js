// SVG Parameters
let width = 1400;
let height = 800;
let barPadding = 4;

let startDate = 1960;
let endDate = 2017;
let dateRange = [];
let currentData = {};
for (let y = startDate; y <= endDate; y++) {
    dateRange.push(y);
}

let countryInfoUrl = './data/map/countries.json';
let dataSeriesValuesUrl = './data/hnp/HNP_StatsData.csv';
let dataSeriesDefinitionsUrl = './data/hnp/HNP_StatsSeries.csv';
let topoJsonWorldMapUrl = '//unpkg.com/world-atlas@1.1.4/world/50m.json';

let dataYear = -1;
let dataSet = '';

let tooltip = d3.select('body')
                  .append('div')
                    .classed('card', true)
                    .classed('tooltip', true)
                  .append('div')
                    .classed('card-body', true);

beginLoading();
buildSvg(width, height);

d3.queue()
  .defer(d3.csv, dataSeriesDefinitionsUrl, seriesInfoFormatter)
  .defer(d3.json, topoJsonWorldMapUrl)
  .defer(d3.json, countryInfoUrl)
  .await( (e, seriesInfo, topoJson, jsonCountryInfo) => {
    let countryIdDataMap = getCountryIdMap(jsonCountryInfo);
    drawMap(topoJson, countryIdDataMap);

    d3.csv(dataSeriesValuesUrl,
        dataSeriesFormatter,
        onDataLoaded.bind(null, countryIdDataMap, seriesInfo));
  });

function getCountryIdMap(countryData) {
    return countryData.reduce((a, c) => {
        a.set(c.ccn3, c);
        a.set(c.cca3, c);
        return a;
    }, new Map());
}

function drawMap(mapData, numericMap) {
    let geoData = topojson.feature(mapData, mapData.objects.countries).features;

    geoData.forEach((c) => {
        let currentCountry = numericMap.get(c.id);
        if (currentCountry !== undefined) {
            c.cca3 = currentCountry.cca3;
            c.countryInfo = currentCountry;
        }
    });

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
            .attr('fill', 'gray')
            .on('mousemove', showTooltip)
            .on('mouseout', hideTooltip);
}

function onDataLoaded(countryMap, seriesInfo, error, data) {
    let collectedData = getCollectedData(seriesInfo, data);

    let dataVisualizerStrategy =
        setMapForYear.bind(null, collectedData, countryMap);

    buildSelectors(seriesInfo, collectedData, dataVisualizerStrategy);

    d3.select('#loading-msg').remove();
}

function getValidCountryCodeSet(countryInfo) {
    return countryInfo.reduce( (a, c) => {
        a.add(c.countryCode);
        return a;
    }, new Set());
}

function getCollectedData(seriesInfo, data) {
    // Create an empty series code -> year map
    let collectedData = {};
    seriesInfo.forEach((code) => {
        collectedData[code.seriesCode] = {
            indicatorName: code.indicatorName,
        };
        dateRange.forEach((year) => {
            collectedData[code.seriesCode][year] = {};
        });
    });

    // Populate each year with series values keyed by CCA3 code
    data.forEach((row) => {
        if (Object.keys(row).length > 0) {
            for (let year in row.data) {
                if (row.data.hasOwnProperty(year)) {
                    collectedData[row.indicatorCode][year][row.countryCode]
                        = row.data[year];
                }
            }
        }
    });

    // Remove years that have no associated data
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
    let selectedYear = +(d3.select('#year-select').property('value'));
    let selectedSeries = d3.select('#series-select').property('value');
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
    currentData = getDataForSelectedYear(collectedData, countryMap, true);

    colorScale = d3.scaleQuantile()
                    .domain(currentData.domain)
                    .range(['#f7f4f9', '#e7e1ef', '#d4b9da', '#c994c7', '#df65b0', '#e7298a', '#ce1256', '#980043', '#67001f']);
    let borderColorScale = d3.scaleLog()
                             .domain(currentData.extents)
                             .range(['#F49E4C', '#3B8EA5']);

    d3.select('svg')
        .selectAll('.country')
        .transition()
        .attr('fill', (d) =>{
            if (currentData.hasOwnProperty(d.cca3)) {
                let data = currentData[d.cca3].seriesValue;
                let color = colorScale(data);
                return color;
            } else {
                return 'black';
            }
        })
        .attr('stroke', (d) => {
            if (d.cca3 in currentData) {
                let color = borderColorScale(currentData[d.cca3].seriesValue);
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
    let seriesData = {
        extents: [Number.MAX_VALUE, Number.MIN_VALUE],
        domain: [],
        year: year,
    };
    for (let i = 0; i < dateRange.length; i++) {
        let dataYear = dateRange[i];
        let data = fullData[seriesId][dataYear];
        for (country in data) {
            if (data.hasOwnProperty(country)) {
                let dataValue = data[country];
                seriesData.domain.push(dataValue);
                if (dataValue < seriesData.extents[0]) {
                    seriesData.extents[0] = dataValue;
                }
                if (dataValue > seriesData.extents[1]) {
                    seriesData.extents[1] = dataValue;
                }
                seriesData[country] = {
                    seriesValue: dataValue,
                    latestYear: dataYear,
                    countryInfo: countries[country],
                };
            }
        }
        if (dataYear === year) {
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
                seriesValue: +(seriesData[entry].seriesValue),
                latestYear: +(seriesData[entry].latestYear),
            });
        }
    }
    return dataArray;
}

function dataSeriesFormatter(row, i, headers) {
    let rowObj = {
        countryCode: row['Country Code'],
        indicatorCode: row['Indicator Code'],
        data: {},
    };
    for (let i = 4; i < headers.length; i++) {
        if (row[headers[i]] !== '') {
            rowObj.data[headers[i]] = +(row[headers[i]]);
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

function beginLoading() {
    d3.select('#selectors').style('display', 'none');
    d3.select('body')
        .append('p')
            .attr('id', 'loading-msg')
            .text(`Loading data from ${dataSeriesValuesUrl}...`);
}

function showTooltip(d) {
    let coords = d3.mouse(this);
    let html = currentData.hasOwnProperty(d.cca3)
        ? getDataTooltip(d)
        : getEmptyTooltip(d);

    let container = d3.select('.tooltip');

    d3.select('.tooltip')
        .style('opacity', 1)
        .style('left', coords[0] + 'px')
        .style('top', coords[1] + 'px');
    d3.select('.card-body')
        .html(html);
}

function hideTooltip() {
    d3.select('.tooltip')
        .style('opacity', 0);
}

function getDataTooltip(d) {
    return `
        <p>${d.countryInfo.name.common}</p>
        <p>${currentData[d.cca3].seriesValue.toLocaleString()}</p>
        `;
}

function getEmptyTooltip(d) {
    return `
    <p>No data available for ${d.countryInfo.name.common} for year ${currentData.year}</p>
    `;
}
