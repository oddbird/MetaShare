import fetchMock from 'fetch-mock';

import * as actions from '@/store/user/actions';

import { storeWithThunk } from './../../utils';

describe('login', () => {
  beforeEach(() => {
    window.socket = { subscribe: jest.fn() };
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'socket');
  });

  test('returns LoginAction', () => {
    const user = {
      username: 'Test User',
      email: 'test@foo.bar',
    };
    const expected = {
      type: 'USER_LOGGED_IN',
      payload: user,
    };

    expect(actions.login(user)).toEqual(expected);
  });

  test('subscribes to user ws events', () => {
    const user = {
      id: 'user-id',
      username: 'Test User',
      email: 'test@foo.bar',
    };
    const userSubscription = {
      model: 'user',
      id: 'user-id',
    };
    actions.login(user);

    expect(window.socket.subscribe).toHaveBeenCalledWith(userSubscription);
  });

  describe('with Sentry', () => {
    beforeEach(() => {
      window.Sentry = {
        setUser: jest.fn(),
      };
    });

    afterEach(() => {
      Reflect.deleteProperty(window, 'Sentry');
    });

    test('sets user context', () => {
      const user = {
        username: 'Test User',
        email: 'test@foo.bar',
      };
      actions.login(user);

      expect(window.Sentry.setUser).toHaveBeenCalledWith(user);
    });
  });
});

describe('logout', () => {
  let store;

  beforeEach(() => {
    store = storeWithThunk({});
    fetchMock.postOnce(window.api_urls.account_logout(), {
      status: 204,
      body: {},
    });
    window.socket = { reconnect: jest.fn() };
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'socket');
  });

  test('dispatches LogoutAction', () => {
    const loggedOut = {
      type: 'USER_LOGGED_OUT',
    };

    expect.assertions(1);
    return store.dispatch(actions.logout()).then(() => {
      expect(store.getActions()).toEqual([loggedOut]);
    });
  });

  test('reconnects socket', () => {
    expect.assertions(1);
    return store.dispatch(actions.logout()).then(() => {
      expect(window.socket.reconnect).toHaveBeenCalled();
    });
  });

  describe('with Sentry', () => {
    let scope;

    beforeEach(() => {
      scope = {
        clear: jest.fn(),
      };
      window.Sentry = {
        configureScope: (cb) => cb(scope),
      };
    });

    afterEach(() => {
      Reflect.deleteProperty(window, 'Sentry');
    });

    test('resets user context', () => {
      expect.assertions(1);
      return store.dispatch(actions.logout()).then(() => {
        expect(scope.clear).toHaveBeenCalled();
      });
    });
  });
});

describe('refetchAllData', () => {
  describe('success', () => {
    test('GETs user from api, re-fetches repos', () => {
      const store = storeWithThunk({});
      const user = { id: 'me' };
      fetchMock.getOnce(window.api_urls.user(), user);
      fetchMock.getOnce(window.api_urls.repository_list(), []);
      const started = { type: 'REFETCH_DATA_STARTED' };
      const succeeded = { type: 'REFETCH_DATA_SUCCEEDED' };
      const loggedIn = {
        type: 'USER_LOGGED_IN',
        payload: user,
      };
      const refreshingRepos = { type: 'REFRESHING_REPOS' };
      const refreshedRepos = { type: 'REPOS_REFRESHED' };
      const repoPayload = {
        filters: {},
        objectType: 'repository',
        reset: true,
        url: window.api_urls.repository_list(),
      };
      const fetchingRepos = {
        type: 'FETCH_OBJECTS_STARTED',
        payload: repoPayload,
      };

      expect.assertions(1);
      return store.dispatch(actions.refetchAllData()).then(() => {
        expect(store.getActions()).toEqual([
          started,
          loggedIn,
          refreshingRepos,
          refreshedRepos,
          fetchingRepos,
          succeeded,
        ]);
      });
    });

    test('handles missing user', () => {
      const store = storeWithThunk({});
      fetchMock.getOnce(window.api_urls.user(), 401);
      const started = { type: 'REFETCH_DATA_STARTED' };
      const loggedOut = { type: 'USER_LOGGED_OUT' };

      expect.assertions(1);
      return store.dispatch(actions.refetchAllData()).then(() => {
        expect(store.getActions()).toEqual([started, loggedOut]);
      });
    });
  });

  describe('error', () => {
    test('dispatches REFETCH_DATA_FAILED action', () => {
      const store = storeWithThunk({});
      fetchMock.getOnce(window.api_urls.user(), 500);
      const started = { type: 'REFETCH_DATA_STARTED' };
      const failed = { type: 'REFETCH_DATA_FAILED' };

      expect.assertions(5);
      return store.dispatch(actions.refetchAllData()).catch(() => {
        const allActions = store.getActions();

        expect(allActions[0]).toEqual(started);
        expect(allActions[1].type).toEqual('ERROR_ADDED');
        expect(allActions[1].payload.message).toEqual('Internal Server Error');
        expect(allActions[2]).toEqual(failed);
        expect(window.console.error).toHaveBeenCalled();
      });
    });
  });
});

describe('disconnect', () => {
  let url;

  beforeAll(() => {
    url = window.api_urls.user_disconnect_sf();
  });

  describe('success', () => {
    test('returns updated user', () => {
      const store = storeWithThunk({});
      const user = { id: 'me' };
      fetchMock.postOnce(url, user);
      const started = { type: 'USER_DISCONNECT_REQUESTED' };
      const succeeded = { type: 'USER_DISCONNECT_SUCCEEDED', payload: user };

      expect.assertions(1);
      return store.dispatch(actions.disconnect()).then(() => {
        expect(store.getActions()).toEqual([started, succeeded]);
      });
    });
  });

  describe('error', () => {
    test('dispatches USER_DISCONNECT_FAILED action', () => {
      const store = storeWithThunk({});
      fetchMock.postOnce(url, 500);
      const started = { type: 'USER_DISCONNECT_REQUESTED' };
      const failed = { type: 'USER_DISCONNECT_FAILED' };

      expect.assertions(5);
      return store.dispatch(actions.disconnect()).catch(() => {
        const allActions = store.getActions();

        expect(allActions[0]).toEqual(started);
        expect(allActions[1].type).toEqual('ERROR_ADDED');
        expect(allActions[1].payload.message).toEqual('Internal Server Error');
        expect(allActions[2]).toEqual(failed);
        expect(window.console.error).toHaveBeenCalled();
      });
    });
  });
});

describe('refreshDevHubStatus', () => {
  let url;

  beforeAll(() => {
    url = window.api_urls.user();
  });

  describe('success', () => {
    test('returns updated user', () => {
      const store = storeWithThunk({});
      const user = { id: 'me' };
      fetchMock.getOnce(url, user);
      const started = { type: 'DEV_HUB_STATUS_REQUESTED' };
      const succeeded = { type: 'DEV_HUB_STATUS_SUCCEEDED', payload: user };

      expect.assertions(1);
      return store.dispatch(actions.refreshDevHubStatus()).then(() => {
        expect(store.getActions()).toEqual([started, succeeded]);
      });
    });
  });

  describe('error', () => {
    test('dispatches DEV_HUB_STATUS_FAILED action', () => {
      const store = storeWithThunk({});
      fetchMock.getOnce(url, 500);
      const started = { type: 'DEV_HUB_STATUS_REQUESTED' };
      const failed = { type: 'DEV_HUB_STATUS_FAILED' };

      expect.assertions(5);
      return store.dispatch(actions.refreshDevHubStatus()).catch(() => {
        const allActions = store.getActions();

        expect(allActions[0]).toEqual(started);
        expect(allActions[1].type).toEqual('ERROR_ADDED');
        expect(allActions[1].payload.message).toEqual('Internal Server Error');
        expect(allActions[2]).toEqual(failed);
        expect(window.console.error).toHaveBeenCalled();
      });
    });
  });
});

describe('agreeToTerms', () => {
  let url;

  beforeAll(() => {
    url = window.api_urls.agree_to_tos();
  });

  describe('success', () => {
    test('returns updated user', () => {
      const store = storeWithThunk({});
      const user = { id: 'me' };
      fetchMock.putOnce(url, user);
      const started = { type: 'AGREE_TO_TERMS_REQUESTED' };
      const succeeded = { type: 'AGREE_TO_TERMS_SUCCEEDED', payload: user };

      expect.assertions(1);
      return store.dispatch(actions.agreeToTerms()).then(() => {
        expect(store.getActions()).toEqual([started, succeeded]);
      });
    });
  });

  describe('error', () => {
    test('dispatches AGREE_TO_TERMS_FAILED action', () => {
      const store = storeWithThunk({});
      fetchMock.putOnce(url, 500);
      const started = { type: 'AGREE_TO_TERMS_REQUESTED' };
      const failed = { type: 'AGREE_TO_TERMS_FAILED' };

      expect.assertions(5);
      return store.dispatch(actions.agreeToTerms()).catch(() => {
        const allActions = store.getActions();

        expect(allActions[0]).toEqual(started);
        expect(allActions[1].type).toEqual('ERROR_ADDED');
        expect(allActions[1].payload.message).toEqual('Internal Server Error');
        expect(allActions[2]).toEqual(failed);
        expect(window.console.error).toHaveBeenCalled();
      });
    });
  });
});
