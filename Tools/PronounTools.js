exports.Pronouns = {
    HeHimHis: {
        Id: 0,
        NominativeCase: "He",
        AccusativeCase: "Him",
        ReflexivePronoun: "Himself",
        IndependentGenitiveCase: "His",
        DependentGenitiveCase: "His",
        DisplayThree: false
    },
    SheHerHers: {
        Id: 1,
        NominativeCase: "She",
        AccusativeCase: "Her",
        ReflexivePronoun: "Herself",
        IndependentGenitiveCase: "Hers",
        DependentGenitiveCase: "Her",
        DisplayThree: false
    },
    TheyThemTheirs: {
        Id: 2,
        NominativeCase: "They",
        AccusativeCase: "Them",
        ReflexivePronoun: "Themselves",
        DisplayThree: false
    },
    ItIts: {
        Id: 3,
        NominativeCase: "It",
        AccusativeCase: "It",
        ReflexivePronoun: "Itself",
        DependentGenitiveCase: "Its",
        DisplayThree: false
    },
    AnyAnyAny: {
        Id: 4,
        NominativeCase: "Any",
        AccusativeCase: "Any",
        DisplayThree: false
    },
    // Sorry if some of these neopronouns are wrong, please fix if they are
    ZeZirZirs: {
        Id: 5,
        NominativeCase: "Ze",
        AccusativeCase: "Zir",
        ReflexivePronoun: "Zirself",
        IndependentGenitiveCase: "Zirs",
        DisplayThree: true
    },
    ZeHirHirs: {
        Id: 6,
        NominativeCase: "Ze",
        AccusativeCase: "Hir",
        ReflexivePronoun: "Hirself",
        IndependentGenitiveCase: "Hirs",
        DisplayThree: true
    },
    XeXemXyrs: {
        Id: 7,
        NominativeCase: "Xe",
        AccusativeCase: "Xem",
        ReflexivePronoun: "Xyrself",
        IndependentGenitiveCase: "Xyrs",
        DisplayThree: true
    },
    EyEmEirs: {
        Id: 8,
        NominativeCase: "Ey",
        AccusativeCase: "Em",
        ReflexivePronoun: "Eirself",
        IndependentGenitiveCase: "Eirs",
        DisplayThree: true
    },
    FaeFaerFaers: {
        Id: 9,
        NominativeCase: "Fae",
        AccusativeCase: "Faer",
        ReflexivePronoun: "Faerself",
        IndependentGenitiveCase: "Faers",
        DisplayThree: true
    },
    EEmEms: {
        Id: 10,
        NominativeCase: "Em",
        AccusativeCase: "Eir",
        ReflexivePronoun: "Eirself",
        IndependentGenitiveCase: "Eirs",
        DisplayThree: true
    },
    VeVerVis: {
        Id: 11,
        NominativeCase: "Ve",
        AccusativeCase: "Ver",
        ReflexivePronoun: "Verself",
        IndependentGenitiveCase: "Vis",
        DisplayThree: true
    },
    NeNemNir: {
        Id: 12,
        NominativeCase: "Ne",
        AccusativeCase: "Nem",
        ReflexivePronoun: "Nemself",
        IndependentGenitiveCase: "Nirs",
        DisplayThree: true
    },
    PerPerPers: {
        Id: 13,
        NominativeCase: "Per",
        AccusativeCase: "Pers",
        ReflexivePronoun: "Perself",
        IndependentGenitiveCase: "Pers",
        DisplayThree: true
    },
    Other: {
        Id: -1,
        NominativeCase: "Other",
        AccusativeCase: "Other",
        DisplayThree: false
    },
    Ask: {
        Id: -2,
        NominativeCase: "Ask",
        AccusativeCase: "Ask",
        DisplayThree: false
    },
    Avoid: {
        Id: -3,
        NominativeCase: "Avoid",
        AccusativeCase: "Avoid",
        DisplayThree: false
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
        default:
            return null
    }
}

exports.createPronouns = function (nominativeId, accusativeId, reflexiveId, independentId, dependentId) {
    let pronouns = {
        NominativeCase: null,
        AccusativeCase: null,
        ReflexivePronoun: null,
        IndependentGenitiveCase: null,
        DependentGenitiveCase: null,
        Action: false,
        DisplayThree: false
    }
    if(nominativeId < 0){
        let action = exports.getPronounGroupById(nominativeId).NominativeCase
        pronouns.NominativeCase = action
        pronouns.AccusativeCase = action
        pronouns.ReflexivePronoun = action
        pronouns.IndependentGenitiveCase = action
        pronouns.DependentGenitiveCase = action
        pronouns.Action = true
    }
    else{
        pronouns.NominativeCase = exports.getPronounGroupById(nominativeId).NominativeCase
        pronouns.AccusativeCase = exports.getPronounGroupById(accusativeId).AccusativeCase
        let r = exports.getPronounGroupById(reflexiveId).ReflexivePronoun
        if(r)
            pronouns.ReflexivePronoun = r
        let i = exports.getPronounGroupById(independentId).IndependentGenitiveCase
        if(i)
            pronouns.IndependentGenitiveCase = i
        let d = exports.getPronounGroupById(dependentId)
        if(d.DependentGenitiveCase){
            pronouns.DependentGenitiveCase = d.DependentGenitiveCase
            if (d.DisplayThree)
                pronouns.DisplayThree = true
        }
    }
    return pronouns
}