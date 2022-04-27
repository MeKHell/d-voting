import express from 'express';
import axios, { AxiosError, Method } from 'axios';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import morgan from 'morgan';
import kyber from '@dedis/kyber';
import crypto from 'crypto';
import lmdb, { RangeOptions } from 'lmdb';
import xss from 'xss';

const config = require('../config.json');

const app = express();

app.use(morgan('tiny'));

declare module 'express-session' {
  export interface SessionData {
    userid: number;
    firstname: string;
    lastname: string;
    role: string;
  }
}

// Express-session
app.set('trust-proxy', 1);

app.use(cookieParser());
const oneDay = 1000 * 60 * 60 * 24;
app.use(
  session({
    secret: config.SESSION_SECRET,
    saveUninitialized: true,
    cookie: { maxAge: oneDay },
    resave: false,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/*
 * Access control
 * */
// app.use((req, res, next) => {
//   const begin = req.url.split('?')[0];
//   let role = 'everyone';
//   if (req.session.userid && req.session.role) {
//     role = req.session.role;
//   }

//   if (accessConfig[role].includes(begin)) {
//     next();
//   } else {
//     res.status(400).send('Unauthorized');
//   }
// });

const usersDB = lmdb.open({ path: 'dvoting-users' });

// This is via this endpoint that the client request the tequila key, this key
// will then be used for redirection on the tequila server
app.get('/api/get_teq_key', (req, res) => {
  const body = `urlaccess=${config.FRONT_END_URL}/api/control_key\nservice=Evoting\nrequest=name,firstname,email,uniqueid,allunits`;
  axios
    .post('https://tequila.epfl.ch/cgi-bin/tequila/createrequest', body)
    .then((response) => {
      const key = response.data.split('\n')[0].split('=')[1];
      const url = `https://tequila.epfl.ch/cgi-bin/tequila/requestauth?requestkey=${key}`;
      res.json({ url: url });
    })
    .catch((error: AxiosError) => {
      console.log('message:', error.message);
      res.status(500).send(`failed to request Tequila authentication: ${error.message}`);
    });
});

// Here the client will send the key he/she received from the tequila, it is
// then verified on the tequila. If the key is valid, the user is then logged
// in the website through this backend
app.get('/api/control_key', (req, res) => {
  const userKey = req.query.key;
  const body = `key=${userKey}`;

  axios
    .post('https://tequila.epfl.ch/cgi-bin/tequila/fetchattributes', body)
    .then((resa) => {
      if (!resa.data.includes('status=ok')) {
        throw new Error('Login did not work');
      }

      const sciper = resa.data.split('uniqueid=')[1].split('\n')[0];
      const lastname = resa.data.split('\nname=')[1].split('\n')[0];
      const firstname = resa.data.split('\nfirstname=')[1].split('\n')[0];

      const user = usersDB.get(sciper) || {};
      if (user.role === undefined || user.role === '') {
        user.role = 'voter';
        user.lastname = lastname;
        user.firstname = firstname;
        user.loggedin = false;
      }
      console.log('sciper:', sciper);
      if (sciper === '228271') {
        user.role = 'admin';
      }
      return usersDB.put(sciper, user).then(() => [sciper, user]);
    })
    .then(([sciper, user]) => {
      req.session.userid = parseInt(sciper, 10);
      req.session.lastname = user.lastname;
      req.session.firstname = user.firstname;
      req.session.role = user.role;
      res.redirect('/logged');
    })
    .catch((error) => {
      res.status(500).send('Login did not work');
      console.log(error);
    });
});

// This endpoint serves to logout from the app by clearing the session.
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// As the user is logged on the app via this express but must also be logged in
// the react. This endpoint serves to send to the client (actually to react)
// the information of the current user.
app.get('/api/personal_info', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.session.userid) {
    res.json({
      sciper: req.session.userid,
      lastname: req.session.lastname,
      firstname: req.session.firstname,
      role: req.session.role,
      islogged: true,
    });
  } else {
    res.json({
      sciper: 0,
      lastname: '',
      firstname: '',
      role: '',
      islogged: false,
    });
  }
});

// This call allow a user that is admin to get the list of the poeple that have
// a special role (not a voter).
app.get('/api/user_rights', (req, res) => {
  const sciper = req.session.userid;

  if (!sciper) {
    res.status(400).send('Not logged in');
    return;
  }

  const user = usersDB.get(sciper);

  if (user.role !== 'admin') {
    res.status(400).send('You must be admin to request this');
    return;
  }

  const opts: RangeOptions = {};
  const users = Array.from(usersDB.getRange(opts).map(({ value }) => value));
  res.json(users);
});

// This call (only for admins) allow an admin to add a role to a voter.
app.post('/api/add_role', (req, res) => {
  if (!req.session.userid) {
    res.status(400).send('Not logged in');
    return;
  }

  const requester = usersDB.get(req.session.userid);
  if (requester.role !== 'admin') {
    res.status(400).send('You must be admin to request this');
    return;
  }

  const { sciper } = req.body;
  const { role } = req.body;
  const user = usersDB.get(sciper);
  user.role = role;

  usersDB.put(sciper, user).catch((error) => {
    res.status(500).send('Add role failed');
    console.log(error);
  });
});

// This call (only for admins) allow an admin to remove a role to a user.
app.post('/api/remove_role', (req, res) => {
  if (!req.session.userid) {
    res.status(400).send('Not logged in');
    return;
  }

  if (req.session.role !== 'admin') {
    res.status(400).send('You must be admin to request this');
    return;
  }

  const { sciper } = req.body;

  usersDB
    .remove(sciper)
    .then(() => {
      res.status(200).send('Removed');
    })
    .catch((error) => {
      res.status(500).send('Remove role failed');
      console.log(error);
    });
});

// sendToDela signs the message and sends it to the dela proxy. It makes no
// authentication check.
function sendToDela(dataStr: string, req: express.Request, res: express.Response) {
  let dataStrB64 = Buffer.from(dataStr).toString('base64url');
  while (dataStrB64.length % 4 !== 0) {
    dataStrB64 += '=';
  }

  const hash: Buffer = crypto.createHash('sha256').update(dataStrB64).digest();

  const edCurve = kyber.curve.newCurve('edwards25519');

  const priv = Buffer.from(config.PRIVATE_KEY, 'hex');
  const pub = Buffer.from(config.PUBLIC_KEY, 'hex');

  const scalar = edCurve.scalar();
  scalar.unmarshalBinary(priv);

  const point = edCurve.point();
  point.unmarshalBinary(pub);

  const sign = kyber.sign.schnorr.sign(edCurve, scalar, hash);

  const payload = {
    Payload: dataStrB64,
    Signature: sign.toString('hex'),
  };

  // we strip the `/api` part: /api/election/xxx => /election/xxx
  const uri = config.DELA_NODE_URL + req.baseUrl.slice(4);

  console.log('sending payload:', JSON.stringify(payload), 'to', uri);

  axios({
    method: req.method as Method,
    url: uri,
    data: payload,
    headers: {
      'Content-Type': 'application/json',
    },
  })
    .then((resp) => {
      res.status(200).send(resp.data);
    })
    .catch((error: AxiosError) => {
      let resp = '';
      if (error.response) {
        resp = JSON.stringify(error.response.data);
      }

      res
        .status(500)
        .send(`failed to proxy request: ${req.method} ${uri} - ${error.message} - ${resp}`);
    });
}

app.use('/api/evoting/*', (req, res, next) => {
  if (req.session.role !== 'admin') {
    console.log('role is:', req.session.role);
    res.status(400).send('Unauthorized');
  } else {
    next();
  }
});

// This API call is used redirect all the calls for DELA to the DELAs nodes.
// During this process the data are processed : the user is authenticated and
// controlled. Once this is done the data are signed before the are sent to the
// DELA node To make this work, react has to redirect to this backend all the
// request that needs to go the DELA nodes
app.use('/api/evoting/*', (req, res, next) => {
  if (!req.session.userid) {
    res.status(400).send('Unauthorized');
    return;
  }

  const bodyData = req.body;

  const dataStr = JSON.stringify(bodyData);

  // special case for voting
  const regex = /\/api\/evoting\/elections\/.*\/vote/;
  if (req.baseUrl.match(regex)) {
    // will be handled by the next matcher, just bellow
    next();
  } else {
    sendToDela(dataStr, req, res);
  }
});

app.post('/api/evoting/elections/:electionID/vote', (req, res) => {
  const bodyData = req.body;

  // We must set the UserID to know who this ballot is associated to. This is
  // only needed to allow users to cast multiple ballots, where only the last
  // ballot is taken into account. To preserve anonymity the web-backend could
  // translate UserIDs to another random ID.
  bodyData.UserID = req.session.userid;

  const dataStr = JSON.stringify(bodyData);

  sendToDela(dataStr, req, res);
});

// Handles any requests that don't match the ones above
app.get('*', (req, res) => {
  console.log('404 not found');
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.status(404).send(`not found ${xss(url.toString())}`);
});

const port = process.env.PORT || 5000;
app.listen(port);

console.log(`App is listening on port ${port}`);
