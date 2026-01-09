"use strict";

const Endpoints = {
  userStationList: "/v1/api/userStationList",
  stationDetail: "/v1/api/stationDetail",
  stationDay: "/v1/api/stationDay",

  inverterList: "/v1/api/inverterList",
  inverterDetail: "/v1/api/inverterDetail",
  inverterDay: "/v1/api/inverterDay",

  epmList: "/v1/api/epmList",
  epmDetail: "/v1/api/epmDetail",
  epmDay: "/v1/api/epm/day",

  collectorList: "/v1/api/collectorList",
  collectorDetail: "/v1/api/collectorDetail",
  collectorDay: "/v1/api/collector/day",

  weatherList: "/v1/api/weatherList",
  weatherDetail: "/v1/api/weatherDetail",

  stationDetailList: "/v1/api/stationDetailList",
  stationDayEnergyList: "/v1/api/stationDayEnergyList",
  stationMonthEnergyList: "/v1/api/stationMonthEnergyList",
  stationYearEnergyList: "/v1/api/stationYearEnergyList",
  stationMonth: "/v1/api/stationMonth",
  stationYear: "/v1/api/stationYear",
  stationAll: "/v1/api/stationAll",

  inverterDetailList: "/v1/api/inverterDetailList",
  inverterMonth: "/v1/api/inverterMonth",
  inverterYear: "/v1/api/inverterYear",

  epmMonth: "/v1/api/epm/month",
  epmYear: "/v1/api/epm/year",
  epmAll: "/v1/api/epm/all",

  collectorSignal: "/v1/api/collector/signal",

  ammeterList: "/v1/api/ammeterList",
  ammeterDetail: "/v1/api/ammeterDetail",
  alarmList: "/v1/api/alarmList"
};

module.exports = { Endpoints };