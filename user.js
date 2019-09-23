'use strict';
var debug = require('debug')('user');
var util = require('util');
var tool = require('leaptool');
var moment = require('moment');

module.exports = function(app) {

  var module_name = 'user';
  app.eventEmitter.emit('extension::init', module_name);

  var block = tool.object(require('base')(app, module_name));
  block.role = 'admin';
  block.description ='user management',
  block.tags = ['system'];
  block.depends = ['email'];

  block.data = tool.object(require('basedata')(app, module_name));
  block.page = tool.object(require('basepage')(app, module_name, block.data));

  block.model = {
    id: { 
      type: 'string', 
      default_value: '',
      config:{ auto:true } 
    },
    username: {
      type: 'string',
      required: true
    },
    firstname: {
      type: 'string'
    },
    lastname: {
      type: 'string'
    },
    email: {
      type: 'string',
      subtype: {
        type: 'email'
      },
      required: true,
      option: {
        unique: true
      }
    },
    phone: {
      type: 'string',
      subtype: { type:'phone' }
    },
    phone_secondary: {
      type: 'string',
      subtype: { type:'phone' }
    },
    salt: {
      type: 'string',
      subtype: {
        type:'string'
      },
      config:{ auto:true }
    },
    password: {
      type: 'string',
      subtype: {
        type: 'password'
      },
      config:{ auto:true }
    },
    api_token: {
      type: 'string', // jwt token
      config:{ auto:true }
    },
    roles: {
      type: 'array',
      subtype: {
        type:'string'
      }
    },
    status: {
      type: 'string',
      values: [
        { display:'Active', value:'active', default:true },
        { display:'Inactive', value:'inactive' }
      ]
    },
    create_by: { type: 'string', config:{ auto:true } },
    create_date: { type: 'date', config:{ auto:true } },
    edit_by: { type: 'string', config:{ auto:true } },
    edit_date: { type: 'date', config:{ auto:true } }
  };

  block.option = {
    edit_fields: ['username', 'firstname', 'lastname', 'email'],
    list_fields: ['username', 'firstname', 'lastname', 'email', 'status'],
    search_fields: ['username', 'email', 'status']
  };

  block.getPasswordResetKey = function(user) {
    var userId = user._id + '';
    var currentTime =  (new Date()).valueOf();
    var spacer = Math.floor(Math.random()* 10000000000); // 10 digit random number as spacer
    var key = userId + spacer + currentTime;
    key = new Buffer(key).toString('base64');
    return key;
  };
  
  block.login = function(email, password, callback) {
    var condition = { email:email };
    var filter = {};
    app.db.find(module_name, condition, {}, function(error, docs, info) {
      var authenticated = false;
      var user = docs && docs[0] || null;
      if (user) {
        var passwordHash = tool.hash(this.password + user.salt);
        var message = '';
        if (passwordHash === user.password) {
          message = email + ' passes login';
          authenticated = true;
        } else {
          message = email + ' fails login';
        }
      }
      info = { success:authenticated, message:message };
      callback && callback(error, user, info);
    }.bind({ email, password }));
  };
  
  block.findById = function(id, callback) {
    var condition = { _id:id };
    var filter = {};
    app.db.find(module_name, condition, filter, function(error, docs, info) {
      var user = docs && docs[0] || null;
      callback && callback(error, user);
    });
  };
  
  block.findByUsername = function(username, callback) {
    var condition = { username:username };
    var filter = {};
    app.db.find(module_name, condition, filter, function(error, docs, info) {
      var user = docs && docs[0] || null;
      callback && callback(error, user);
    });
  };
  
  block.test = function() {
    return 'user test';
  };

  // data
  block.data.getItemWeb = function(req, res, next) {
    var callback = arguments[3] || null;
    var parameter = tool.getReqParameter(req);
    debug('getWeb parameter:', parameter);
    var condition = tool.getQueryCondition(parameter);
    var filter = tool.getQueryFilter(parameter);
    block.data.getItem(req, res, condition, filter, callback);
  };

  block.data.getItem = function(req, res, condition, filter, callback) {
    debug('getItem query condition:', condition);
    debug('getItem query filter:', filter);
    block.data.get(req, res, condition, filter, function(error, docs, info) {
      debug('getItem result:', error, docs, info);
      app.cb(error, docs, info, req, res, callback);
    });
  };

  block.data.addUser = function(req, res) {
    var callback = arguments[3] || null;
    var parameter = tool.getReqParameter(req);
    // user email is lower case
    parameter.email = parameter.email.toLowerCase();
    parameter.roles = parameter.roles ? parameter.roles : [];
    debug('add user:', parameter);
    tool.setReqParameter(req, parameter);
    var condition = {email: parameter.email};
    var filter = {}
    block.data.get(req, res, condition, filter, function(error, docs, info) {
      var item = docs && docs[0] || null;
      if (item) {
        error = new Error('user exists for email ' + parameter.email);
        info = { message:'Error in adding a new user' };
        app.cb(error, docs, info, req, res, callback);
      } else {
        block.data.addUserNext(req, res, null, callback);
      }
    });
  };

  block.data.addUserNext = function(req, res, next, callback) {
    var user = tool.getReqParameter(req);
    user.username = user.username || user.email;
    user.salt = Math.round(100000000 * Math.random());
    user.password = tool.hash(user.password + user.salt);
    user.api_token = tool.encodeToken({ user:user.username }, app.setting.token_secret);
    block.data.add(req, res, user, function(error, docs, info) {
      var user = docs && docs[0];
      debug('user created:', JSON.stringify(user));
      app.cb(error, docs, info, req, res, callback);
    });
  };

  block.data.login = function(req, res, next) {
    var callback = arguments[3] || null;
    var parameter = tool.getReqParameter(req);
    
    
    // block.login(parameter.email, parameter.password, function(error, user, info) {
    //   app.cb(error, user, info, req, res, callback);
    // });
    
    var email = parameter.email;
    var condition = { email:email };
    var filter = {};
    block.data.get(req, res, condition, filter, function(error, docs, info) {
      var authenticated = false;
      var user = docs && docs[0] || null;
      if (user) {
        var password = tool.hash(parameter.password + user.salt);
        var message = '';
        
        console.log('>>> user:', user);
        console.log('>>> parameter.password:', parameter.password);
        console.log('>>> user.salt:', user.salt);
        
        console.log('>>> password hash:', password);
        console.log('>>> user.password hash:', user.password);
        
        if (password === user.password) {
          message = email + ' passes login';
          authenticated = true;
        } else {
          message = email + ' fails login';
        }
      }
      info = { success:authenticated, message:message };
      app.cb(error, user, info, req, res, callback);
    })
    
  };

  // page
  block.page.login = function(req, res) {
    var page = app.getPage(req, { title:'login' });
    page.redirect = req.query.url || '';
    res.render('user/login', { page:page });
  };

  block.page.loginPost = function(req, res) {
    var parameter = tool.getReqParameter(req);
    block.data.login(req, res, null, function(error, user, info) {
      if (info.success) {
        // req.isAuthenticated = true;
        if (req.session) {
          delete user.salt;
          delete user.password;
          req.session.user = user;
        }
        var nextUrl = parameter.redirect || '/';
        res.redirect(nextUrl);
      } else {
        // req.isAuthenticated = false;
        var text = 'Login failed';
        info = {
          message: 'Incorrect username or password'
        };
        app.renderInfoPage(new Error(text), null, info, req, res);
      }
    });
  };

  block.page.signup = function(req, res) {
    var page = app.getPage(req, {});
    page.title = 'User Signup';
    res.render('user/signup', { page:page });
  };

  block.page.signupPost = function(req, res) {
    var parameter = tool.getReqParameter(req);
    debug('user signup posted - parameter:', parameter);
    var invite_code = parameter.invite_code;
    var user_roles = [];
    switch (parameter.invite_code) {
      case app.setting.invite_code_user:
        user_roles = ['user'];
        break;
      case app.setting.invite_code_admin:
        user_roles = ['admin', 'user'];
        break;
    }
    if (user_roles.length == 0) {
      debug('entered invite code, ' + invite_code + ', does not match');
      var message = 'Incorrect invite code';
      app.renderInfoPage(new Error('Signup Error'), null, { message:message }, req, res);
    } else {
      tool.setReqParameter(req, { roles:user_roles });
      block.data.addUser(req, res, null, function(error, docs, info) {
        if (error) {
          app.renderInfoPage(error, docs, info, req, res);
        } else {
          var user = docs && docs[0];
          if (req.session) {
            // req.isAuthenticated = true;
            req.session.user = user;
          }
          var nextUrl = parameter.redirect || '/';
          res.redirect(nextUrl);
        }
      });
    }
  };

  block.page.logout = function(req, res) {
    // req.isAuthenticated = false;
    if (req.session) {
      req.session.user = null;
    }
    var nextUrl = '/';
    res.redirect(nextUrl);
  };

  block.page.getProfile = function(req, res) {
    var page = app.getPage(req, { title:'User Profile' });
    res.render('user/profile', { page:page });
  };

  block.page.resetPassword = function(req, res){
    var parameter = tool.getReqParameter(req);
    var key = parameter.key;
    if (key) {
      // Password reset key: userId + 10 digit spacer + timestamp
      // decode: new Buffer(key, 'base64').toString('ascii')
      var keyOutput = new Buffer(key, 'base64').toString('ascii');
      var userId = keyOutput.substr(0,24);
      var initDate = new Date(parseInt(keyOutput.substr(34)));
      block.data.getById(req, res, userId, function(error, docs, info) {
        var user = docs && docs[0] || null;
        var page = app.getPage(req);
        page.redirect = req.query.url || '';
        page.title = 'Password Change';
        page.user = user;
        page.key = key;
        res.render('user/password_change', { page:page });
      });
    } else {
      var page = app.getPage(req);
      page.redirect = req.query.url || '';
      page.title = 'Password Reset';
      res.render('user/password_reset', { page:page });
    }
  };

  block.page.resetPasswordPost = function(req, res) {
    var parameter = tool.getReqParameter(req);
    var email = parameter.email || '';
    var condition = { email:email };
    var filter = {};
    block.data.get(req, res, condition, filter, function(error, docs, info) {
      var user = docs && docs[0] || null;
      if (user) {
        // send notification email to user
        var passwordResetKey = block.getPasswordResetKey(user);
        var passwordResetUrl = app.setting.webserver_baseurl +
          '/user/password/reset?key=' + passwordResetKey;
        debug('passwordResetUrl:', passwordResetUrl);
        var email = {
          to: user.email,
          subject: 'Account password reset request',
          content: 'Here is link to reset your password:<br>\r\n<br>\r\n' + passwordResetUrl,
          isHtml: true
        };
        app.module.email.sendMail(email, function(error, mailOptions, info) {
          console.log('mail sent:', error, info);
        });
        info = { message:'Check your email for password reset information' };
      } else {
        info = { message:'User is not found for email entered' };
      }
      app.renderInfoPage(error, null, info, req, res);
    });
  };

  block.page.changePasswordPost = function(req, res) {
    var parameter = tool.getReqParameter(req);
    var password = parameter.password;
    var key = parameter.key || '';
    // Password reset key: userId + 10 digit spacer + timestamp
    // decode: new Buffer(key, 'base64').toString('ascii')
    var keyOutput = new Buffer(key, 'base64').toString('ascii');
    var userId = keyOutput.substr(0,24);
    var parameter2 = {};
    parameter2._id = userId;
    parameter2.password = password;
    block.data.edit(req, res, parameter2, function(error, docs, info) {
      info = { message:'Your password is changed successfully.' };
      app.renderInfoPage(error, null, info, req, res);
    });
  };

  // data route
  app.server.get('/data/user/get', block.data.getItemWeb);

  // page route
  app.server.get('/user/login', block.page.login);
  app.server.post('/user/login', block.page.loginPost);
  app.server.get('/user/signup', block.page.signup);
  app.server.post('/user/signup', block.page.signupPost);
  app.server.get('/user/logout', block.page.logout);
  app.server.all('/user/profile', block.page.checkLogin);
  app.server.get('/user/profile', block.page.getProfile);
  app.server.get('/user/password/reset', block.page.resetPassword);
  app.server.post('/user/password/reset_post', block.page.resetPasswordPost);
  app.server.post('/user/password/change_post', block.page.changePasswordPost);

  return block;
};
