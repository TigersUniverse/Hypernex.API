const Logger = require("./../Logging/Logger.js")

async function getIpFromHostname(hostname) {
    try {
        const response = await fetch(`https://dns.google/resolve?name=${hostname}`)
        const data = await response.json()
        if (data.Answer) {
            const ip = data.Answer[0].data
            return ip
        }
        return ""
    } catch (error) {
        Logger.Error('Error fetching IP: ' + error)
        return ""
    }
}

async function getLocationInfo(ip) {
    try {
        const response = await fetch(`https://api.seeip.org/geoip/${ip}`)
        const data = await response.json()
        return data
    } catch (error) {
        Logger.Error('Error fetching Location: ' + error)
        return {
            latitude: 90,
            longitude: 180,
        }
    }
}

function distance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRadians(lat2-lat1);
    const dLon = toRadians(lon2-lon1);
    const a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLon/2) * Math.sin(dLon/2)
    ;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c;
    return d;
}

function toRadians(degrees) {
    return degrees * Math.PI / 180;
}

function isLocal(urlHostname){
    return /(?:^|\.)localhost$|^(?:\[::1\]|127(?:\.\d+){3})?$/i.test(urlHostname);
}

async function getCDNInfo(server){
    let url = new URL(server)
    if(isLocal(url.hostname))
        return {
            Server: server,
            URL: url,
            IP: url.hostname,
            Latitude: 0,
            Longitude: 0,
        }
    let ip = await getIpFromHostname(url.hostname)
    let geoData = await getLocationInfo(ip)
    return {
        Server: server,
        URL: url,
        IP: ip,
        Latitude: geoData.latitude,
        Longitude: geoData.longitude
    }
}

exports.findClosestServer = async function (ip, servers){
    if(servers.length === 0) {
        return undefined
    }
    else if(servers.length === 1) {
        return servers[0].Server
    }
    let localGeoData = getLocationInfo(ip)
    let shortest = servers[0].Server
    let shortestDistance = distance(localGeoData.latitude, localGeoData.longitude, servers[0].Latitude, servers[0].Longitude)
    for (let i = 1; i < servers.length; i++){
        let ip = servers[i]
        let d = distance(localGeoData.latitude, localGeoData.longitude, ip.Latitude, ip.Longitude)
        if(d > shortestDistance)
            continue
        shortest = ip.Server
        shortestDistance = d
    }
    return shortest
}

exports.initCDNs = function (cdns) {
    return new Promise(async exec => {
        let newCDNs = []
        for(let i = 0; i < cdns.length; i++){
            let cdnServer = cdns[i]
            let info = await getCDNInfo(cdnServer)
            newCDNs.push({
                Server: info.Server,
                Latitude: info.Latitude,
                Longitude: info.Longitude
            })
        }
        exec(newCDNs)
    })
}