exports.Pronouns = {
    HeHimHis: {
        Id: 0,
        NominativeCase: "He",
        AccusativeCase: "Him",
        ReflexivePronoun: "Himself",
        IndependentGenitiveCase: "His",
        DependentGenitiveCase: "His"
    },
    SheHerHers: {
        Id: 1,
        NominativeCase: "She",
        AccusativeCase: "Her",
        ReflexivePronoun: "Herself",
        IndependentGenitiveCase: "Hers",
        DependentGenitiveCase: "Her"
    },
    TheyThemTheirs: {
        Id: 2,
        NominativeCase: "They",
        AccusativeCase: "Them",
        ReflexivePronoun: "Themselves"
    },
    ItIts: {
        Id: 3,
        NominativeCase: "It",
        AccusativeCase: "It",
        ReflexivePronoun: "Itself",
        DependentGenitiveCase: "Its"
    },
    AnyAnyAny: {
        Id: 4,
        NominativeCase: "Any",
        AccusativeCase: "Any"
    },
    // Sorry if some of these neopronouns are wrong, please fix if they are
    ZeZirZirs: {
        Id: 5,
        NominativeCase: "Ze",
        AccusativeCase: "Zir",
        ReflexivePronoun: "Zirself",
        IndependentGenitiveCase: "Zirs"
    },
    ZeHirHirs: {
        Id: 6,
        NominativeCase: "Ze",
        AccusativeCase: "Hir",
        ReflexivePronoun: "Hirself",
        IndependentGenitiveCase: "Hirs"
    },
    XeXemXyrs: {
        Id: 7,
        NominativeCase: "Xe",
        AccusativeCase: "Xem",
        ReflexivePronoun: "Xyrself",
        IndependentGenitiveCase: "Xyrs"
    },
    EyEmEirs: {
        Id: 8,
        NominativeCase: "Ey",
        AccusativeCase: "Em",
        ReflexivePronoun: "Eirself",
        IndependentGenitiveCase: "Eirs"
    },
    FaeFaerFaers: {
        Id: 9,
        NominativeCase: "Fae",
        AccusativeCase: "Faer",
        ReflexivePronoun: "Faerself",
        IndependentGenitiveCase: "Faers"
    },
    EEmEms: {
        Id: 10,
        NominativeCase: "Em",
        AccusativeCase: "Eir",
        ReflexivePronoun: "Eirself",
        IndependentGenitiveCase: "Eirs"
    },
    VeVerVis: {
        Id: 11,
        NominativeCase: "Ve",
        AccusativeCase: "Ver",
        ReflexivePronoun: "Verself",
        IndependentGenitiveCase: "Vis"
    },
    NeNemNir: {
        Id: 12,
        NominativeCase: "Ne",
        AccusativeCase: "Nem",
        ReflexivePronoun: "Nemself",
        IndependentGenitiveCase: "Nirs"
    },
    PerPerPers: {
        Id: 13,
        NominativeCase: "Per",
        AccusativeCase: "Pers",
        ReflexivePronoun: "Perself",
        IndependentGenitiveCase: "Pers"
    },
    Other: {
        Id: -1,
        NominativeCase: "Other",
        AccusativeCase: "Other"
    },
    Ask: {
        Id: -2,
        NominativeCase: "Ask",
        AccusativeCase: "Ask"
    },
    Avoid: {
        Id: -3,
        NominativeCase: "Avoid",
        AccusativeCase: "Avoid"
    }
}

exports.isValidPronounId = function (id) {
    if(Number.isNaN(id))
        return false
    return id >= -1 && id <=13
}

exports.getPronounGroupById = function (id) {
    switch (id) {
        case 0:
            return exports.Pronouns.HeHimHis
        case 1:
            return exports.Pronouns.SheHerHers
        case 2:
            return exports.Pronouns.TheyThemTheirs
        case 3:
            return exports.Pronouns.ItIts
        case 4:
            return exports.Pronouns.AnyAnyAny
        case 5:
            return exports.Pronouns.ZeZirZirs
        case 6:
            return exports.Pronouns.ZeHirHirs
        case 7:
            return exports.Pronouns.XeXemXyrs
        case 8:
            return exports.Pronouns.EyEmEirs
        case 9:
            return exports.Pronouns.FaeFaerFaers
        case 10:
            return exports.Pronouns.EEmEms
        case 11:
            return exports.Pronouns.VeVerVis
        case 12:
            return exports.Pronouns.NeNemNir
        case 13:
            return exports.Pronouns.PerPerPers
        case -1:
            return exports.Pronouns.Other
        case -2:
            return exports.Pronouns.Ask
        case -3:
            return exports.Pronouns.Avoid
        default:
            return undefined
    }
}

exports.isValidCaseId = function (caseid) {
    if(Number.isNaN(caseid))
        return false
    return caseid >= 0 && caseid <= 4
}

exports.getCaseById = function (caseid) {
    switch (caseid) {
        case 0:
            return exports.Cases.NominativeCase
        case 1:
            return exports.Cases.AccusativeCase
        case 2:
            return exports.Cases.ReflexivePronoun
        case 3:
            return exports.Cases.IndependentGenitiveCase
        case 4:
            return exports.Cases.DependentGenitiveCase
        default:
            return -1
    }
}

exports.createPronouns = function (nominativeId, accusativeId, reflexiveId, independentId, dependentId, displayThree, firstCase, secondCase, thirdCase) {
    let pronouns = {
        NominativeCase: exports.getPronounGroupById(nominativeId).NominativeCase,
        AccusativeCase: exports.getPronounGroupById(accusativeId).AccusativeCase,
        ReflexivePronoun: undefined,
        IndependentGenitiveCase: undefined,
        DependentGenitiveCase: undefined,
        Action: false,
        DisplayThree: !!displayThree,
        Display:[
            exports.Cases.NominativeCase,
            exports.Cases.AccusativeCase,
            exports.Cases.ReflexivePronoun
        ]
    }
    let rp = exports.getPronounGroupById(reflexiveId)
    if(rp)
        pronouns.ReflexivePronoun = rp.ReflexivePronoun
    let igc = exports.getPronounGroupById(independentId)
    if(igc)
        pronouns.IndependentGenitiveCase = igc.IndependentGenitiveCase
    let dgc = exports.getPronounGroupById(dependentId)
    if(dgc)
        pronouns.DependentGenitiveCase = dgc.DependentGenitiveCase
    if(!!displayThree){
        if(exports.isValidCaseId(firstCase))
            pronouns.Display[0] = exports.getCaseById(firstCase)
        if(exports.isValidCaseId(secondCase))
            pronouns.Display[1] = exports.getCaseById(secondCase)
        if(displayThree)
            if(exports.isValidCaseId(thirdCase))
                pronouns.Display[2] = exports.getCaseById(thirdCase)
    }
    return pronouns
}

exports.Cases = {
    NominativeCase: 0,
    AccusativeCase: 1,
    ReflexivePronoun: 2,
    IndependentGenitiveCase: 3,
    DependentGenitiveCase: 4
}