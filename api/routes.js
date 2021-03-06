// all our APIs
var User            = require('./models/User');
const mongoose = require("mongoose");

module.exports = function (app, passport, mongooseModel) {


  app.get('/signup', (req, res) => {
    res.render('tempregister.ejs', { message: req.flash('signupMessage') });
  });

  app.get('/profile', isLoggedIn, (req, res) => {
    res.render('temphomescreen.ejs', { user: req.user });
  });

  app.get('/login', (req, res) => {
    res.render('templogin.ejs', { message: req.flash('loginMessage') });
  });



  app.post('/signup', function (req, res, next) {
    passport.authenticate('signup', function (err, user, info) {
      
      if (err) res.json(null);
      else if (user) res.json(false);
      else {
        res.json(true);
      }
    })(req, res, next);
  });


  app.post('/login', function (req, res, next) {
    passport.authenticate('login', function (err, user) {
      
      if (err) res.json(err);
      else if (!user) res.json({ status: false, profile: null });
      else {
        res.json({
          status: true, name: user.name, profile: {
            sports: user.sports, movies: user.movies, outdoor: user.outdoor,
            indoor: user.indoor, cuisines: user.cuisines, arts: user.arts,
            personality: user.personality, personalInfo: user.personalInfo,
            bio: user.bio
          }
        });
      }
    })(req, res, next);
  });


  app.post('/search', (req, res) => {
    //req.body contains an object with the user's email and a variable set of key-value pairs for each section
    //that the user wanted to look in and the values for that section. For example, one object could be:
    //{email: "username_here", sports: ['Baseball', 'Football'], arts: ['Video Editing']}
    //You will never receive an empty list, so you will not have to check for this
    console.log("Finding a match");
    
    mongooseModel.find({}, function (err, userCollection) {
      // fetch searcher's document
      var user;
      for (let i = 0; i < userCollection.length; i++) {
        
        if (userCollection[i].email === req.body.email) {
          user = userCollection[i];
          break;
        }
      }

      var request = req.body;
      var ratings = [];
      
      if(!user)
      {
        res.json(null);
        return;
      }

      //reset once they have seen most users
      if(user.matchHistory.length > user.candidates.length)
        user.matchHistory = [];

      // assigning a rating to each username
      for (var j = 0; j < userCollection.length; j++) {
        ratings.push(
          {
            'rating': calculateUserSimilarity(request, userCollection[j]),
            'email': userCollection[j].email
          }
        );
      }
      // try to sort based on ascending rating
      ratings.sort(function (a, b) {
        return b['rating'] - a['rating'];
      });
      console.log('ratings:');
      console.log(ratings);
      console.log('\n');

      let candidates = [];
      ratings.forEach(element => {
        // you can't be matched with yourself or someone you've been matched with before
        if (element['email'] && element['email'] !== user['email'] && !user['matchHistory'].includes(element['email'])) {/* see if the user had been matched before */
          candidates.push(element['email']);
        }
      });

      user.candidates = candidates;
      user.save();

      //update the candidate property in the database
      //You must return true if a match is found and false if not
      res.json(true);
    });
  });


  app.post('/feed', (req, res) => {
    //req.body is in the form: { email: "username_here", getNewUser: isNew }, where isNew is a true/false value
    //indicating whether the user wants to get the next entry in their matched list (true), or whether they
    //just want to grab the old user (one that the server has already sent) and look again at them. This means
    //that if you have an array of users, you start off at element 0 right after a search (you should keep an index
    //value as a part of the user's profile), and you only increment this number when isNew is true. In summary,
    //if isNew is true, you increment the index by 1 and give the user at that new index. If isNew is false, you
    //keep the index the same and give the user at that same index.
    // Note: if another user can be found in the next element of the you must send a user in this form (should
    //get rid of other information, and at least must have the following entries):
    //Note: if no user can be found, simply say 'res.json(null)'

    let collection = mongooseModel;
    let match;
    // retrieve all the users (very bad not scalable)
    collection.find({}, function (err, userCollection) {
      let user;
      for (let i = 0; i < userCollection.length; i++) {
        
        if (userCollection[i].email === req.body.email) {
          user = userCollection[i];
          break;
        }
      }
      let candidates = user.candidates;
      let matchHistory = user.matchHistory;
      
      if (req.body.getNewUser) {
        console.log('getting new user');
        // pop from candidates
        if (candidates.length > 0) {
          match = candidates.shift();
          // add to matchHistory
          matchHistory.push(match);
          // make sure the changes are made to the database
          user.candidates = candidates;
          user.matchHistory = matchHistory;
          user.save();
        }
        if (candidates.length > 0) {
          match = candidates[0];
        } else {
          res.json(null);
          return;
        }
      } else {
        console.log('not new user');
        if (candidates.length > 0) {
          match = candidates[0];
        } else {
          res.json(null);
          return;
        }
      }
      console.log('match:', match);
      // match now contains the username of the match
      for (let i = 0; i < userCollection.length; i++) {
       
        if (userCollection[i].email === match) {
          match = userCollection[i];
          break;
        }
      }
      let copyMatch = {};
      //get rid of sensitive information in match
      var profile = {};
      for (var key in match) {
        let relevantProperties = ['sports', 'movies', 'outdoor', 'indoor', 'cuisines',
          'arts', 'personality', 'personalInfo', 'bio', 'movies'];
        if (relevantProperties.includes(key)) {
          if (match[key]) {
            profile[key] = match[key];
          } else if (key === 'bio') {
            profile[key] = 'bio stuff';
          } else {
            profile[key] = [];
          }
        }
      }
      copyMatch.email = match.email;
      copyMatch.profile = profile;
      res.json(copyMatch);
    });
  })

  app.post('/change_profile', async (req, res) => {
      const doc = await User.findOne({ email: req.body.email });

      doc[req.body.section] = req.body.list;

      if(req.body.section === "personalInfo")
        doc["bio"] = req.body.bio;

      await doc.save();

      res.json(true);
    })

  app.post('/messages', async (req, res) => {
    //req.body is in the form: { email: "username_here"}
    //Must send back object of users with true/false values for whether or not there is a new message
    //(true means new message, false means not). Order does not matter unless you want it too, in which
    //case put the newest messages first and the older messages later

    const doc = await User.findOne({ email: req.body.email });

    var messages = {};

    if(!doc.messagesList)
    {
      res.json({});
    }
    else
    {
      doc.messagesList.forEach((value, key) =>
      {
        messages[key] = value;
      })

      res.json(messages);
    }
  });

  app.post('/read_message', async (req, res) => {
    const doc = await User.findOne({ email: req.body.email });

    if(!doc.messagesList) res.json(false);
    else
    {
      var isListed = doc.messagesList.get(req.body.readUser);
      if(isListed === false) res.json(true);
      else if(!isListed)
      {
        console.log("Error: trying to read user message that is not in messagesList");
        res.json(false);
      }
      else
      {
        doc.messagesList.set(req.body.readUser, false);
        await doc.save();
        res.json(true);
      }
    }
  });

  // route middleware to make sure a user is logged in
  function isLoggedIn(req, res, next) {

    // if user is authenticated in the session, carry on 
    if (req.isAuthenticated())
      return next();

    // if they aren't redirect them to the home page
    res.redirect('/login');
  }

  const matchAlg = (userJSON) => {

  };

  const fetchUserDocument = (username) => {
    mongooseModel.findOne({ email: username }, function (err, result) {
      return result;
    });
  };

  /*
      Given users userOne and userTwo, return the fraction of similar
      properties between the two. If divided by zero, return -1.
      If the property is a string, 'similar' equals strings equality.
      If the property is a number, 'similar' is still undefined
   */
  const calculateUserSimilarity = (userOne, userTwo) => {
    let similarity = 0;
    let relevantProperties = Object.keys(userOne);

    for (let keyIndex=0; keyIndex<relevantProperties.length; keyIndex++) {
      let key = relevantProperties[keyIndex];
      if(key === "email") continue;

      for (let i = 0; i < userOne[key].length; i++) {
        if (userTwo[key].includes(userOne[key][i])) {
          similarity += 1;
        }
      }
    }
    return similarity;
  }

}


