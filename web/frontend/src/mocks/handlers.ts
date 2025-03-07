import { rest } from 'msw';
import ShortUniqueId from 'short-unique-id';
import { ROUTE_LOGGED } from 'Routes';

import {
  ENDPOINT_GET_TEQ_KEY,
  ENDPOINT_LOGOUT,
  ENDPOINT_PERSONAL_INFO,
} from '../components/utils/Endpoints';
import * as endpoints from '../components/utils/Endpoints';

import {
  AddAuthBody,
  EditDKGActorBody,
  EditFormBody,
  NewDKGBody,
  NewFormVoteBody,
  NewProxyAddress,
  NewUserRole,
  RemoveUserRole,
  UpdateProxyAddress,
} from '../types/frontendRequestBody';

import { ID } from 'types/configuration';
import { Action, Status } from 'types/form';
import { setupMockForm, toLightFormInfo } from './setupMockForms';
import setupMockUserDB from './setupMockUserDB';
import { NodeStatus } from 'types/node';

const uid = new ShortUniqueId({ length: 8 });
const mockUserID = 561934;
const fakeToken = 'fake token';

const { mockForms, mockResults, mockDKG, mockNodeProxyAddresses } = setupMockForm();

let mockUserDB = setupMockUserDB();

const RESPONSE_TIME = 500;
const CHANGE_STATUS_TIMER = 2000;
const INIT_TIMER = 1000;
const SHUFFLE_TIMER = 2000;
const DECRYPT_TIMER = 1000;

const defaultProxy = 'http://localhost/';

const isAuthorized = (
  auth: Map<String, Array<String>>,
  subject: string,
  action: string
): boolean => {
  return auth.has(subject) && auth.get(subject).indexOf(action) !== -1;
};
const auth = new Map<String, Array<String>>();

export const handlers = [
  rest.get(ENDPOINT_PERSONAL_INFO, async (req, res, ctx) => {
    auth.set('roles', ['list', 'remove', 'add']);
    auth.set('proxy', ['list', 'remove', 'add']);
    auth.set('election', ['create']);
    const isLogged = sessionStorage.getItem('is-authenticated') === 'true';
    const userId = isLogged ? mockUserID : 0;
    const userInfos = isLogged
      ? {
          lastName: 'Bobster',
          firstName: 'Alice',
          sciper: userId,
          authorization: Object.fromEntries(auth),
        }
      : {};
    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    return res(
      ctx.status(200),
      ctx.json({
        isLoggedIn: isLogged,
        ...userInfos,
      })
    );
  }),

  rest.get(ENDPOINT_GET_TEQ_KEY, async (req, res, ctx) => {
    const url = ROUTE_LOGGED;
    sessionStorage.setItem('is-authenticated', 'true');
    sessionStorage.setItem('id', mockUserID.toString());

    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    return res(ctx.status(200), ctx.json({ url: url }));
  }),

  rest.post(ENDPOINT_LOGOUT, (req, res, ctx) => {
    sessionStorage.setItem('is-authenticated', 'false');
    return res(ctx.status(200));
  }),

  rest.get(endpoints.forms(defaultProxy), async (req, res, ctx) => {
    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    return res(
      ctx.status(200),
      ctx.json({
        Forms: Array.from(mockForms.values()).map((form) =>
          toLightFormInfo(mockForms, form.FormID)
        ),
      })
    );
  }),
  rest.put(endpoints.addFormAuthorization, async (req) => {
    const { FormID } = req.body as AddAuthBody;
    auth.set(FormID, ['own']);
  }),

  rest.get(endpoints.form(defaultProxy, ':FormID'), async (req, res, ctx) => {
    const { FormID } = req.params;
    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    return res(
      ctx.status(200),
      ctx.json({ FormID: mockForms.get(FormID as ID), Token: fakeToken })
    );
  }),

  rest.post(endpoints.newForm, async (req, res, ctx) => {
    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    if (!isAuthorized(auth, 'election', 'create')) {
      return res(ctx.status(403), ctx.json({ message: 'You are not authorized to create a form' }));
    }

    return res(ctx.status(200), ctx.json({ Status: 0, Token: fakeToken }));
  }),

  rest.post(endpoints.newFormVote(':FormID'), async (req, res, ctx) => {
    const { Ballot }: NewFormVoteBody = req.body as NewFormVoteBody;
    const { FormID } = req.params;

    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    const Voters = mockForms.get(FormID as string).Voters;
    Voters.push('userID' + (Voters.length + 1));

    mockForms.set(FormID as string, {
      ...mockForms.get(FormID as string),
      Voters,
    });

    const BallotID = uid();

    return res(
      ctx.status(200),
      ctx.json({
        BallotID: BallotID,
        Ballot: Ballot,
      })
    );
  }),

  rest.put(endpoints.editForm(':FormID'), async (req, res, ctx) => {
    const body = req.body as EditFormBody;
    const { FormID } = req.params;
    let status = Status.Initial;
    const Result = [];

    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    if (!isAuthorized(auth, 'election', 'create')) {
      return res(ctx.status(403), ctx.json({ message: 'You are not authorized to update a form' }));
    }

    switch (body.Action) {
      case Action.Open:
        status = Status.Open;
        break;
      case Action.Close:
        status = Status.Closed;
        break;
      case Action.CombineShares:
        status = Status.ResultAvailable;
        mockResults.get(FormID as string).forEach((result) => Result.push(result));
        break;
      case Action.Cancel:
        status = Status.Canceled;
        break;
      default:
        break;
    }

    setTimeout(
      () =>
        mockForms.set(FormID as string, {
          ...mockForms.get(FormID as string),
          Status: status,
          Result,
        }),
      CHANGE_STATUS_TIMER
    );

    return res(ctx.status(200), ctx.json({ Status: 0, Token: fakeToken }));
  }),

  rest.delete(endpoints.editForm(':FormID'), async (req, res, ctx) => {
    const { FormID } = req.params;
    mockForms.delete(FormID as string);
    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    return res(ctx.status(200), ctx.json({ Status: 0, Token: fakeToken }));
  }),

  rest.post(endpoints.dkgActors, async (req, res, ctx) => {
    const body = req.body as NewDKGBody;

    let node = '';
    mockForms.get(body.FormID).Roster.forEach((n) => {
      const p = mockNodeProxyAddresses.get(n);
      if (p === body.Proxy) {
        node = n;
      }
    });

    setTimeout(() => {
      const newDKGStatus = new Map(mockDKG.get(body.FormID));
      newDKGStatus.set(node, NodeStatus.Initialized);
      mockDKG.set(body.FormID, newDKGStatus);
    }, INIT_TIMER);

    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    return res(ctx.status(200));
  }),

  rest.put(endpoints.editDKGActors(':FormID'), async (req, res, ctx) => {
    const { FormID } = req.params;
    const body = req.body as EditDKGActorBody;

    switch (body.Action) {
      case Action.Setup:
        const newDKGStatus = new Map(mockDKG.get(FormID as string));
        let node = '';

        const roster = mockForms.get(FormID as string).Roster;

        const INCREMENT = 1200;

        roster.forEach((n) => {
          const p = mockNodeProxyAddresses.get(n);
          if (p === body.Proxy) {
            node = n;
          }
        });

        const setup = () => {
          newDKGStatus.set(node, NodeStatus.Setup);
          mockDKG.set(FormID as string, newDKGStatus);
        };

        const certified = () => {
          roster.forEach((n) => {
            newDKGStatus.set(n, NodeStatus.Certified);
          });
          mockDKG.set(FormID as string, newDKGStatus);

          setTimeout(setup, INCREMENT);
        };

        const certifying = () => {
          roster.forEach((n) => {
            newDKGStatus.set(n, NodeStatus.Certifying);
          });
          mockDKG.set(FormID as string, newDKGStatus);

          setTimeout(certified, INCREMENT);
        };

        const responding = () => {
          roster.forEach((n) => {
            newDKGStatus.set(n, NodeStatus.Responding);
          });
          mockDKG.set(FormID as string, newDKGStatus);

          setTimeout(certifying, INCREMENT);
        };

        const dealing = () => {
          roster.forEach((n) => {
            newDKGStatus.set(n, NodeStatus.Dealing);
          });
          mockDKG.set(FormID as string, newDKGStatus);

          setTimeout(responding, INCREMENT);
        };

        setTimeout(dealing, INCREMENT);

        break;
      case Action.BeginDecryption:
        setTimeout(
          () =>
            mockForms.set(FormID as string, {
              ...mockForms.get(FormID as string),
              Status: Status.PubSharesSubmitted,
            }),
          DECRYPT_TIMER
        );

        break;
      default:
        break;
    }

    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    return res(ctx.status(200), ctx.text('Action successfully done'));
  }),

  rest.get(endpoints.getDKGActors('*', ':FormID'), async (req, res, ctx) => {
    const { FormID } = req.params;
    const Proxy = req.params[0];
    let node = '';

    mockForms.get(FormID as string).Roster.forEach((n) => {
      const p = mockNodeProxyAddresses.get(n);
      if (p === Proxy) {
        node = n;
      }
    });

    const currentNodeStatus = mockDKG.get(FormID as string).get(node);

    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    if (currentNodeStatus === NodeStatus.NotInitialized) {
      return res(ctx.status(404), ctx.json(`Form ${FormID} does not exist`));
    } else {
      return res(
        ctx.status(200),
        ctx.json({
          Status: currentNodeStatus,
          Error: { Title: '', Code: 0, Message: '', Args: {} },
        })
      );
    }
  }),

  rest.put(endpoints.editShuffle(':FormID'), async (req, res, ctx) => {
    const { FormID } = req.params;

    if (!isAuthorized(auth, 'election', 'create')) {
      return res(ctx.status(403), ctx.json({ message: 'You are not authorized to update a form' }));
    }

    setTimeout(
      () =>
        mockForms.set(FormID as string, {
          ...mockForms.get(FormID as string),
          Status: Status.ShuffledBallots,
        }),
      SHUFFLE_TIMER
    );

    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    return res(ctx.status(200), ctx.text('Action successfully done'));
  }),

  rest.get(endpoints.ENDPOINT_USER_RIGHTS, async (req, res, ctx) => {
    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    if (!isAuthorized(auth, 'roles', 'list')) {
      return res(
        ctx.status(403),
        ctx.json({ message: 'You are not authorized to get users rights' })
      );
    }

    return res(ctx.status(200));
  }),

  rest.post(endpoints.ENDPOINT_ADD_ROLE, async (req, res, ctx) => {
    const body = req.body as NewUserRole;

    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    if (!isAuthorized(auth, 'roles', 'add')) {
      return res(ctx.status(403), ctx.json({ message: 'You are not authorized to add a role' }));
    }

    mockUserDB.push(body);

    return res(ctx.status(200));
  }),

  rest.post(endpoints.ENDPOINT_REMOVE_ROLE, async (req, res, ctx) => {
    const body = req.body as RemoveUserRole;
    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    if (!isAuthorized(auth, 'roles', 'remove')) {
      return res(ctx.status(403), ctx.json({ message: 'You are not authorized to remove a role' }));
    }
    mockUserDB = mockUserDB.filter((user) => user.sciper !== body.sciper);

    return res(ctx.status(200));
  }),

  rest.post(endpoints.newProxyAddress, async (req, res, ctx) => {
    const body = req.body as NewProxyAddress;

    mockNodeProxyAddresses.set(body.NodeAddr, body.Proxy);
    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    return res(ctx.status(200), ctx.text('Action successfully done'));
  }),

  rest.get(endpoints.getProxyAddress('*'), async (req, res, ctx) => {
    const NodeAddr = req.params[0];
    const proxy = mockNodeProxyAddresses.get(decodeURIComponent(NodeAddr as string));

    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    return res(
      ctx.status(200),
      ctx.json({ NodeAddr: decodeURIComponent(NodeAddr as string), Proxy: proxy })
    );
  }),

  rest.get(endpoints.getProxiesAddresses, async (req, res, ctx) => {
    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    return res(ctx.status(200), ctx.json({ Proxies: Object.fromEntries(mockNodeProxyAddresses) }));
  }),

  rest.put(endpoints.editProxyAddress('*'), async (req, res, ctx) => {
    const NodeAddr = req.params[0];
    const body = req.body as UpdateProxyAddress;
    const node = decodeURIComponent(NodeAddr as string);

    if (body.NewNode !== node) {
      mockNodeProxyAddresses.delete(node);
      mockNodeProxyAddresses.set(body.NewNode, body.Proxy);
    } else {
      mockNodeProxyAddresses.set(node, body.Proxy);
    }

    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    return res(ctx.status(200), ctx.text('Action successfully done'));
  }),

  rest.delete(endpoints.editProxyAddress('*'), async (req, res, ctx) => {
    const NodeAddr = req.params[0];

    mockNodeProxyAddresses.delete(decodeURIComponent(NodeAddr as string));

    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    return res(ctx.status(200), ctx.text('Action successfully done'));
  }),

  rest.get(endpoints.getProxyConfig, async (req, res, ctx) => {
    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    const response = defaultProxy;

    return res(ctx.status(200), ctx.text(response));
  }),

  rest.get(endpoints.checkTransaction('*'), async (req, res, ctx) => {
    await new Promise((r) => setTimeout(r, RESPONSE_TIME));

    return res(ctx.status(200), ctx.json({ Status: 1, Token: fakeToken }));
  }),
];
