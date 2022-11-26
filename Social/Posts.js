const Logger = require("../Logging/Logger.js")
const Database = require("../Data/Database.js")
const Users = require("../Game/Users.js")
const ID = require("../Data/ID.js")
const DateTools = require("../Tools/DateTools.js")
const ArrayTools = require("../Tools/ArrayTools.js")

const POSTS_PREFIX = "posts/"

// Called whenever a user is created
exports.initUser = function (userdata) {
    return new Promise(exec => {
        let newPostData = {
            Id: userdata.Id,
            Posts: [],
            Likes: []
        }
        Database.set(POSTS_PREFIX + userdata.Id, newPostData).then(r => {
            if(r){
                Logger.Log("Created Social data for user " + userdata.Username)
                exec(true)
            }
            else
                exec(false)
        }).catch(err => {
            Logger.Error("Failed to save posts for reason " + err)
            throw err
        })
    })
}

// The API will check to see if the requesting account has access to a private account or if the user is blocked
exports.getPostDataFromUserId = function (userid) {
    return new Promise(exec => {
        Users.doesUserExist(userid).then(exists => {
            if(exists){
                Database.get(POSTS_PREFIX + userid).then(postdata => {
                    if(postdata){
                        exec(postdata)
                    }
                    else
                        throw new Error("Failed to get post data for user " + userid)
                }).catch(err => throw err)
            }
            else
                throw new Error("No user with UserId " + userid + " was found!")
        }).catch(err => throw err)
    })
}

exports.getPagesOfPostsFromUserId = function (userid, page, postsperpage) {
    return new Promise(exec => {
        Users.doesUserExist(userid).then(exists => {
            if(exists){
                Database.get(POSTS_PREFIX + userid).then(postdata => {
                    if(postdata){
                        if(postsperpage === null)
                            postsperpage = 50
                        if(page === null)
                            page = 1
                        let allposts = postdata.Posts
                        let posts = []
                        let startingi = page * postsperpage
                        for(let i = 0; i < postsperpage; i++){
                            let ii = startingi + i
                            if(allposts[ii] !== null)
                                posts[posts.length] = allposts[ii]
                        }
                        exec(posts)
                    }
                    else
                        throw new Error("Failed to get post data for user " + userid)
                }).catch(err => throw err)
            }
            else
                throw new Error("No user with UserId " + userid + " was found!")
        }).catch(err => throw err)
    })
}

exports.getPostByPostId = function (userid, postid) {
    return new Promise(exec => {
        Users.doesUserExist(userid).then(exists => {
            if(exists){
                Database.get(POSTS_PREFIX + userid).then(postdata => {
                    if(postdata){
                        let i = ArrayTools.customFind(postdata.Posts, item => item.PostId === postid)
                        if(i)
                            exec(postdata.Posts[i])
                        else
                            throw new Error("Failed to find post from user " + userid + " with postid " + postid)
                    }
                    else
                        throw new Error("Failed to get post data for user " + userid)
                }).catch(err => throw err)
            }
            else
                throw new Error("No user with UserId " + userid + " was found!")
        }).catch(err => throw err)
    })
}

function setPostData(postdata) {
    return new Promise(exec => {
        Database.set(POSTS_PREFIX + postdata.Id, postdata).then(r => {
            if (r)
                exec(true)
            else
                exec(false)
        }).catch(err => throw err)
    })
}

function doesPostIdExist(posts, id){
    for(let i = 0; i < posts.length; i++){
        let post = posts[i]
        if(post.PostId === id)
            return true
    }
    return false
}

function isValidPost(post){
    /*
     * A post should look like this
     * {
     *      // The Id is the user where the post will appear, this should be set by server
     *      UserId: "",
     *      // Who made the original post, set by client, but should be verified by the server
     *      PostFromUserId: "" OR null,
     *      // The Id of the original post, set by client, but should be verified by the server
     *      PostFromUserPostId: "" OR null,
     *      // Post identifier, should be set by the server
     *      PostId: "",
     *      // Content of the post, if repeated, verify by server
     *      PostContent: "",
     *      // Set by the Server (example object given)
     *      PostEdits: [{
     *          PostContent: "",
     *          PostDate: 0
     *      }],
     *      // This is UNIX time, this should be set by the server
     *      PostDate: 0,
     *      // UserId list
     *      Likes: [],
     *      // UserId list
     *      Shares: [],
     *      Comments: [{
     *          FromUserId: "",
     *          PostContent: "",
     *          Likes: [],
     *          Shares: [],
     *          Comments: []
     *      }]
     * }
     */
    // TODO: Allow Content Changing
    return new Promise(exec => {
        if(post.PostFromUserPostId !== null && post.PostFromUserId !== null){
            exports.getPostFromPostId(post.PostFromUserId, post.PostFromUserPostId).then(originalPost => {
                if(originalPost){
                    if(originalPost.PostContent === post.PostContent)
                        exec(post.PostContent !== null && (post.PostContent instanceof String || typeof post.PostContent === 'string'))
                    else
                        exec(false)
                }
                else
                    exec(false)
            }).catch(() => exec(false))
        }
        else{
            exec(post.PostContent !== null && (post.PostContent instanceof String || typeof post.PostContent === 'string'))
        }
    })
}

// TODO: Comments, Comments of Comments, Likes, Shares
exports.createPost = function (userid, tokenContent, post, postdate) {
    return new Promise(exec => {
        Users.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                exports.getPostDataFromUserId(userid).then(postdata => {
                    if(postdata){
                        post.UserId = postdata.Id
                        if(postdate !== null && !Number.isNaN(postdate))
                            post.PostDate = postdate
                        else
                            post.PostDate = DateTools.getUnixTime(new Date())
                        post.PostEdits = []
                        isValidPost(post).then(validPost => {
                            if(validPost){
                                let postid = ID.new(ID.IDTypes.Post)
                                while(doesPostIdExist(postdata.Posts, postid))
                                    postid = ID.new(ID.IDTypes.Post)
                                post.PostId = postid
                                postdata.Posts[postdata.Posts.length] = post
                                setPostData(postdata).then(r => {
                                    exec(r)
                                }).catch(err => {
                                    Logger.Error("Failed to create post for reason " + err)
                                    exec(false)
                                })
                            }
                        })
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

// Server only
exports.getPostFromPostId = function (userid, postid) {
    return new Promise(exec => {
        exports.getPostDataFromUserId(userid).then(postdata => {
            if(postdata){
                let f = false
                for(let i = 0; i < postdata.Posts; i++){
                    let post = postdata.Posts[i]
                    if(post.PostId === postid){
                        f = true
                        exec(post)
                        break
                    }
                }
                if(!f)
                    exec(null)
            }
            else
                exec(null)
        }).catch(() => exec(null))
    })
}

function isPostShared(post){
    try{
        return post.PostFromUserId !== null && post.PostFromUserId !== ""
    }catch (e) {
        return true
    }
}

exports.editPost = function (userid, tokenContent, newpost) {
    return new Promise(exec => {
        Users.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                exports.getPostDataFromUserId(userid).then(postdata => {
                    if(postdata){
                        let npd = postdata
                        let posti = ArrayTools.customFind(npd.Posts, item => item.PostId === newpost.PostId)
                        if(posti){
                            let post = npd.Posts[posti]
                            isValidPost(newpost).then(validPost => {
                                // Post must be valid and not shared to edit
                                if(validPost && !isPostShared(post)){
                                    npd.PostEdits[postdata.PostEdits.length] = {
                                        PostContent: post.PostContent,
                                        PostDate: post.PostDate
                                    }
                                    post.PostContent = newpost.PostContent
                                    setPostData(npd).then(r => {
                                        exec(r)
                                    }).catch(err => {
                                        Logger.Error("Failed to save post for reason " + err)
                                        exec(false)
                                    })
                                }
                                else
                                    exec(false)
                            }).catch(() => exec(false))
                        }
                        else
                            exec(false)
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}

exports.deletePost = function (userid, tokenContent, postid) {
    return new Promise(exec => {
        Users.isUserIdTokenValid(userid, tokenContent).then(validToken => {
            if(validToken){
                exports.getPostDataFromUserId(userid).then(postdata => {
                    if(postdata){
                        let npd = postdata
                        let newposts = ArrayTools.customFilterArray(npd.Posts, item => item.PostId !== postid)
                        npd.Posts = newposts
                        setPostData(npd).then(r => {
                            exec(r)
                        }).catch(err => {
                            Logger.Error("Failed to save post for reason " + err)
                            exec(false)
                        })
                    }
                    else
                        exec(false)
                }).catch(() => exec(false))
            }
            else
                exec(false)
        }).catch(() => exec(false))
    })
}