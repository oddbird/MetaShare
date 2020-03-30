import fetchMock from 'fetch-mock';

import * as actions from '@/store/orgs/actions';
import { addUrlParams } from '@/utils/api';

import { storeWithThunk } from './../../utils';

describe('provisionOrg', () => {
  const org = {
    id: 'org-id',
    owner: 'user-id',
    url: '/test/url/',
    org_type: 'Dev',
    task: 'task-id',
  };
  const orgAction = {
    type: 'SCRATCH_ORG_PROVISION',
    payload: org,
  };

  test('triggers action', () => {
    const store = storeWithThunk({
      user: { id: 'user-id' },
      tasks: {
        'project-id': [
          { id: 'task-id', name: 'My Task', project: 'project-id' },
        ],
      },
    });
    store.dispatch(
      actions.provisionOrg({
        model: org,
        orginating_user_id: 'another-user-id',
      }),
    );
    const allActions = store.getActions();

    expect(allActions[0].type).toEqual('SCRATCH_ORG_PROVISION');
    expect(allActions[0]).toEqual(orgAction);
  });

  describe('owned by current user', () => {
    test('adds success message', () => {
      const store = storeWithThunk({
        user: { id: 'user-id' },
        tasks: {
          'project-id': [
            { id: 'task-id', name: 'My Task', project: 'project-id' },
          ],
        },
      });
      store.dispatch(
        actions.provisionOrg({
          model: org,
          originating_user_id: 'user-id',
        }),
      );
      const allActions = store.getActions();

      expect(allActions[0].type).toEqual('TOAST_ADDED');
      expect(allActions[0].payload.heading).toEqual(
        'Successfully created Dev Org for task “My Task”.',
      );
      expect(allActions[0].payload.linkText).toEqual('View your new org.');
      expect(allActions[0].payload.linkUrl).toEqual(
        window.api_urls.scratch_org_redirect(org.id),
      );
      expect(allActions[1]).toEqual(orgAction);
    });
  });

  test('does not fail if missing url', () => {
    const store = storeWithThunk({ user: { id: 'user-id' }, tasks: {} });
    const thisOrg = { ...org, url: null };
    const thisOrgAction = { ...orgAction, payload: thisOrg };
    store.dispatch(
      actions.provisionOrg({
        model: thisOrg,
        originating_user_id: 'user-id',
      }),
    );
    const allActions = store.getActions();

    expect(allActions[0].type).toEqual('TOAST_ADDED');
    expect(allActions[0].payload.heading).toEqual(
      'Successfully created Dev Org.',
    );
    expect(allActions[0].payload.linkText).toBeUndefined();
    expect(allActions[0].payload.linkUrl).toBeUndefined();
    expect(allActions[1]).toEqual(thisOrgAction);
  });
});

describe('provisionFailed', () => {
  test('returns action', () => {
    const store = storeWithThunk({});
    const org = { id: 'org-id' };
    const action = { type: 'SCRATCH_ORG_PROVISION_FAILED', payload: org };
    store.dispatch(
      actions.provisionFailed({ model: org, message: 'error msg' }),
    );

    expect(store.getActions()).toEqual([action]);
  });

  describe('owned by current user', () => {
    test('adds error message', () => {
      const store = storeWithThunk({
        user: { id: 'user-id' },
        tasks: {
          'project-id': [
            { id: 'task-id', name: 'My Task', project: 'project-id' },
          ],
        },
      });
      const org = {
        id: 'org-id',
        owner: 'user-id',
        url: '/test/url/',
        org_type: 'Dev',
        task: 'task-id',
      };
      const orgAction = {
        type: 'SCRATCH_ORG_PROVISION_FAILED',
        payload: org,
      };
      store.dispatch(
        actions.provisionFailed({
          model: org,
          message: 'error msg',
          originating_user_id: 'user-id',
        }),
      );
      const allActions = store.getActions();

      expect(allActions[0].type).toEqual('TOAST_ADDED');
      expect(allActions[0].payload.heading).toEqual(
        'Uh oh. There was an error creating your new Dev Org for task “My Task”.',
      );
      expect(allActions[0].payload.details).toEqual('error msg');
      expect(allActions[0].payload.variant).toEqual('error');
      expect(allActions[1]).toEqual(orgAction);
    });

    test('does not fail if missing url', () => {
      const store = storeWithThunk({ user: { id: 'user-id' }, tasks: {} });
      const org = {
        id: 'org-id',
        owner: 'user-id',
        org_type: 'Dev',
        task: 'task-id',
      };
      const orgAction = {
        type: 'SCRATCH_ORG_PROVISION_FAILED',
        payload: org,
      };
      store.dispatch(
        actions.provisionFailed({
          model: org,
          message: 'error msg',
          originating_user_id: 'user-id',
        }),
      );
      const allActions = store.getActions();

      expect(allActions[0].type).toEqual('TOAST_ADDED');
      expect(allActions[0].payload.heading).toEqual(
        'Uh oh. There was an error creating your new Dev Org.',
      );
      expect(allActions[0].payload.linkText).toBeUndefined();
      expect(allActions[0].payload.linkUrl).toBeUndefined();
      expect(allActions[1]).toEqual(orgAction);
    });
  });
});

describe('refetchOrg', () => {
  let url, payload;

  beforeAll(() => {
    url = addUrlParams(window.api_urls.scratch_org_detail('org-id'), {
      get_unsaved_changes: true,
    });
    const org = {
      id: 'org-id',
    };
    payload = { org, url: window.api_urls.scratch_org_detail('org-id') };
  });

  test('GETs org from api', () => {
    const store = storeWithThunk({});
    fetchMock.getOnce(url, payload.org);
    const started = {
      type: 'REFETCH_ORG_STARTED',
      payload,
    };
    const succeeded = {
      type: 'REFETCH_ORG_SUCCEEDED',
      payload,
    };

    expect.assertions(1);
    return store.dispatch(actions.refetchOrg(payload.org)).then(() => {
      expect(store.getActions()).toEqual([started, succeeded]);
    });
  });

  test('handles null response', () => {
    const store = storeWithThunk({});
    fetchMock.getOnce(url, 404);
    const started = {
      type: 'REFETCH_ORG_STARTED',
      payload,
    };
    const succeeded = {
      type: 'REFETCH_ORG_FAILED',
      payload: { ...payload, response: null },
    };

    expect.assertions(1);
    return store.dispatch(actions.refetchOrg(payload.org)).then(() => {
      expect(store.getActions()).toEqual([started, succeeded]);
    });
  });

  describe('error', () => {
    test('dispatches REFETCH_ORG_FAILED action', () => {
      const store = storeWithThunk({});
      fetchMock.getOnce(url, 500);
      const started = {
        type: 'REFETCH_ORG_STARTED',
        payload,
      };
      const failed = {
        type: 'REFETCH_ORG_FAILED',
        payload,
      };

      expect.assertions(3);
      return store.dispatch(actions.refetchOrg(payload.org)).catch(() => {
        const allActions = store.getActions();

        expect(allActions[0]).toEqual(started);
        expect(allActions[1].type).toEqual('ERROR_ADDED');
        expect(allActions[2]).toEqual(failed);
      });
    });
  });
});

describe('updateOrg', () => {
  test('returns SCRATCH_ORG_UPDATE action', () => {
    const org = { id: 'org-id' };
    const expected = { type: 'SCRATCH_ORG_UPDATE', payload: org };

    expect(actions.updateOrg(org)).toEqual(expected);
  });
});

describe('updateFailed', () => {
  test('adds error message', () => {
    const store = storeWithThunk({
      user: { id: 'user-id' },
      tasks: {
        'project-id': [
          { id: 'task-id', name: 'My Task', project: 'project-id' },
        ],
      },
    });
    const org = {
      id: 'org-id',
      task: 'task-id',
      owner: 'user-id',
    };
    const action = {
      type: 'SCRATCH_ORG_UPDATE',
      payload: org,
    };
    store.dispatch(
      actions.updateFailed({
        model: org,
        message: 'error msg',
        originating_user_id: 'user-id',
      }),
    );
    const allActions = store.getActions();

    expect(allActions[0].type).toEqual('TOAST_ADDED');
    expect(allActions[0].payload.heading).toEqual(
      'Uh oh. There was an error checking for changes on your scratch org for task “My Task”.',
    );
    expect(allActions[0].payload.details).toEqual('error msg');
    expect(allActions[0].payload.variant).toEqual('error');
    expect(allActions[1]).toEqual(action);
  });

  test('adds error message (no task)', () => {
    const store = storeWithThunk({ tasks: {}, user: { id: 'user-id' } });
    const org = {
      id: 'org-id',
      task: 'task-id',
      owner: 'user-id',
    };
    const action = {
      type: 'SCRATCH_ORG_UPDATE',
      payload: org,
    };
    store.dispatch(
      actions.updateFailed({
        model: org,
        originating_user_id: 'user-id',
      }),
    );
    const allActions = store.getActions();

    expect(allActions[0].type).toEqual('TOAST_ADDED');
    expect(allActions[0].payload.heading).toEqual(
      'Uh oh. There was an error checking for changes on your scratch org.',
    );
    expect(allActions[0].payload.details).toBeUndefined();
    expect(allActions[0].payload.variant).toEqual('error');
    expect(allActions[1]).toEqual(action);
  });
});

describe('deleteOrg', () => {
  beforeEach(() => {
    window.socket = { unsubscribe: jest.fn() };
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'socket');
  });

  test('unsubscribes from socket and returns action', () => {
    const store = storeWithThunk({});
    const org = { id: 'org-id' };
    const action = { type: 'SCRATCH_ORG_DELETE', payload: org };
    store.dispatch(
      actions.deleteOrg({ model: org, originating_user_id: 'user-id' }),
    );
    expect(store.getActions()).toEqual([action]);
    expect(window.socket.unsubscribe).toHaveBeenCalledWith({
      model: 'scratch_org',
      id: 'org-id',
    });
  });

  describe('owned by current user', () => {
    test('adds success message', () => {
      const store = storeWithThunk({
        user: { id: 'user-id' },
        tasks: {
          'project-id': [
            { id: 'task-id', name: 'My Task', project: 'project-id' },
          ],
        },
      });
      const org = {
        id: 'org-id',
        owner: 'user-id',
        url: '/test/url/',
        org_type: 'Dev',
        task: 'task-id',
      };
      const orgAction = { type: 'SCRATCH_ORG_DELETE', payload: org };
      store.dispatch(
        actions.deleteOrg({
          model: org,
          originating_user_id: 'user-id',
        }),
      );
      const allActions = store.getActions();

      expect(allActions[0].type).toEqual('TOAST_ADDED');
      expect(allActions[0].payload.heading).toEqual(
        'Successfully deleted Dev Org for task “My Task”.',
      );
      expect(allActions[1]).toEqual(orgAction);
    });

    test('adds error message if exists', () => {
      const store = storeWithThunk({
        user: { id: 'user-id' },
        tasks: {
          'project-id': [
            { id: 'task-id', name: 'My Task', project: 'project-id' },
          ],
        },
      });
      const org = {
        id: 'org-id',
        owner: 'user-id',
        url: '/test/url/',
        org_type: 'Dev',
        task: 'task-id',
      };
      const orgAction = { type: 'SCRATCH_ORG_DELETE', payload: org };
      store.dispatch(
        actions.deleteOrg({
          model: org,
          message: 'Broke the widget.',
          originating_user_id: 'user-id',
        }),
      );
      const allActions = store.getActions();

      expect(allActions[0].type).toEqual('TOAST_ADDED');
      expect(allActions[0].payload.heading).toEqual(
        'Uh oh. There was an error communicating with your scratch org.',
      );
      expect(allActions[1]).toEqual(orgAction);
    });
  });
});

describe('deleteFailed', () => {
  describe('owned by current user', () => {
    test('adds error message', () => {
      const store = storeWithThunk({
        user: { id: 'user-id' },
        tasks: {
          'project-id': [
            { id: 'task-id', name: 'My Task', project: 'project-id' },
          ],
        },
      });
      const org = {
        id: 'org-id',
        owner: 'user-id',
        org_type: 'Dev',
        task: 'task-id',
      };
      const orgAction = {
        type: 'SCRATCH_ORG_DELETE_FAILED',
        payload: org,
      };
      store.dispatch(
        actions.deleteFailed({
          model: org,
          message: 'error msg',
          originating_user_id: 'user-id',
        }),
      );
      const allActions = store.getActions();

      expect(allActions[0].type).toEqual('TOAST_ADDED');
      expect(allActions[0].payload.heading).toEqual(
        'Uh oh. There was an error deleting your Dev Org for task “My Task”.',
      );
      expect(allActions[0].payload.details).toEqual('error msg');
      expect(allActions[0].payload.variant).toEqual('error');
      expect(allActions[1]).toEqual(orgAction);
    });
  });
});

describe('commitSucceeded', () => {
  test('adds success message', () => {
    const store = storeWithThunk({
      user: { id: 'user-id' },
      tasks: {
        'project-id': [
          { id: 'task-id', name: 'My Task', project: 'project-id' },
        ],
      },
    });
    const org = {
      id: 'org-id',
      task: 'task-id',
      owner: 'user-id',
    };
    const action = {
      type: 'SCRATCH_ORG_COMMIT_CHANGES',
      payload: org,
    };
    store.dispatch(
      actions.commitSucceeded({ model: org, originating_user_id: 'user-id' }),
    );
    const allActions = store.getActions();

    expect(allActions[0].type).toEqual('TOAST_ADDED');
    expect(allActions[0].payload.heading).toEqual(
      'Successfully retrieved changes from your scratch org on task “My Task”.',
    );
    expect(allActions[1]).toEqual(action);
  });

  test('adds success message [no known task]', () => {
    const store = storeWithThunk({
      user: { id: 'user-id' },
      tasks: {},
    });
    const org = {
      id: 'org-id',
      task: 'task-id',
      owner: 'user-id',
    };
    const action = {
      type: 'SCRATCH_ORG_COMMIT_CHANGES',
      payload: org,
    };
    store.dispatch(
      actions.commitSucceeded({ model: org, originating_user_id: 'user-id' }),
    );
    const allActions = store.getActions();

    expect(allActions[0].type).toEqual('TOAST_ADDED');
    expect(allActions[0].payload.heading).toEqual(
      'Successfully retrieved changes from your scratch org.',
    );
    expect(allActions[1]).toEqual(action);
  });
});

describe('commitFailed', () => {
  test('adds error message', () => {
    const store = storeWithThunk({
      user: { id: 'user-id' },
      tasks: {
        'project-id': [
          { id: 'task-id', name: 'My Task', project: 'project-id' },
        ],
      },
    });
    const org = {
      id: 'commit-id',
      task: 'task-id',
      owner: 'user-id',
    };
    const action = {
      type: 'SCRATCH_ORG_COMMIT_CHANGES_FAILED',
      payload: org,
    };
    store.dispatch(
      actions.commitFailed({
        model: org,
        message: 'error msg',
        originating_user_id: 'user-id',
      }),
    );
    const allActions = store.getActions();

    expect(allActions[0].type).toEqual('TOAST_ADDED');
    expect(allActions[0].payload.heading).toEqual(
      'Uh oh. There was an error retrieving changes from your scratch org on task “My Task”.',
    );
    expect(allActions[0].payload.details).toEqual('error msg');
    expect(allActions[0].payload.variant).toEqual('error');
    expect(allActions[1]).toEqual(action);
  });

  test('adds error message [no known task]', () => {
    const store = storeWithThunk({
      user: { id: 'user-id' },
      tasks: {},
    });
    const org = {
      id: 'org-id',
      task: 'task-id',
      owner: 'user-id',
    };
    const action = {
      type: 'SCRATCH_ORG_COMMIT_CHANGES_FAILED',
      payload: org,
    };
    store.dispatch(
      actions.commitFailed({
        model: org,
        message: 'error msg',
        originating_user_id: 'user-id',
      }),
    );
    const allActions = store.getActions();

    expect(allActions[0].type).toEqual('TOAST_ADDED');
    expect(allActions[0].payload.heading).toEqual(
      'Uh oh. There was an error retrieving changes from your scratch org.',
    );
    expect(allActions[0].payload.details).toEqual('error msg');
    expect(allActions[0].payload.variant).toEqual('error');
    expect(allActions[1]).toEqual(action);
  });
});

describe('refreshOrg', () => {
  const org = {
    id: 'org-id',
  };
  let url;

  beforeAll(() => {
    url = window.api_urls.scratch_org_refresh(org.id);
  });

  test('dispatches refreshOrg actions', () => {
    const store = storeWithThunk({});
    fetchMock.postOnce(url, 202);
    const refreshOrgRequested = {
      type: 'SCRATCH_ORG_REFRESH_REQUESTED',
      payload: org,
    };
    const refreshOrgAccepted = {
      type: 'SCRATCH_ORG_REFRESH_ACCEPTED',
      payload: org,
    };

    expect.assertions(1);
    return store.dispatch(actions.refreshOrg(org)).then(() => {
      expect(store.getActions()).toEqual([
        refreshOrgRequested,
        refreshOrgAccepted,
      ]);
    });
  });

  describe('error', () => {
    test('dispatches SCRATCH_ORG_REFRESH_REJECTED action', () => {
      const store = storeWithThunk({});
      fetchMock.postOnce(url, {
        status: 500,
        body: { non_field_errors: ['Foobar'] },
      });
      const started = {
        type: 'SCRATCH_ORG_REFRESH_REQUESTED',
        payload: org,
      };
      const failed = {
        type: 'SCRATCH_ORG_REFRESH_REJECTED',
        payload: org,
      };

      expect.assertions(5);
      return store.dispatch(actions.refreshOrg(org)).catch(() => {
        const allActions = store.getActions();

        expect(allActions[0]).toEqual(started);
        expect(allActions[1].type).toEqual('ERROR_ADDED');
        expect(allActions[1].payload.message).toEqual(['Foobar']);
        expect(allActions[2]).toEqual(failed);
        expect(window.console.error).toHaveBeenCalled();
      });
    });
  });
});

describe('orgRefreshed', () => {
  test('adds success message', () => {
    const store = storeWithThunk({
      user: { id: 'user-id' },
      tasks: {
        'project-id': [
          { id: 'task-id', name: 'My Task', project: 'project-id' },
        ],
      },
    });
    const org = {
      id: 'org-id',
      task: 'task-id',
      owner: 'user-id',
    };
    const action = {
      type: 'SCRATCH_ORG_UPDATE',
      payload: org,
    };
    store.dispatch(
      actions.orgRefreshed({ model: org, originating_user_id: 'user-id' }),
    );
    const allActions = store.getActions();

    expect(allActions[0].type).toEqual('TOAST_ADDED');
    expect(allActions[0].payload.heading).toEqual(
      'Successfully refreshed your scratch org on task “My Task”.',
    );
    expect(allActions[1]).toEqual(action);
  });

  test('adds success message [no known task]', () => {
    const store = storeWithThunk({
      user: { id: 'user-id' },
      tasks: {},
    });
    const org = {
      id: 'org-id',
      task: 'task-id',
      owner: 'user-id',
    };
    const action = {
      type: 'SCRATCH_ORG_UPDATE',
      payload: org,
    };
    store.dispatch(
      actions.orgRefreshed({ model: org, originating_user_id: 'user-id' }),
    );
    const allActions = store.getActions();

    expect(allActions[0].type).toEqual('TOAST_ADDED');
    expect(allActions[0].payload.heading).toEqual(
      'Successfully refreshed your scratch org.',
    );
    expect(allActions[1]).toEqual(action);
  });
});

describe('refreshError', () => {
  test('adds error message', () => {
    const store = storeWithThunk({
      user: { id: 'user-id' },
      tasks: {
        'project-id': [
          { id: 'task-id', name: 'My Task', project: 'project-id' },
        ],
      },
    });
    const org = {
      id: 'commit-id',
      task: 'task-id',
      owner: 'user-id',
    };
    const action = {
      type: 'SCRATCH_ORG_UPDATE',
      payload: org,
    };
    store.dispatch(
      actions.refreshError({
        model: org,
        message: 'error msg',
        originating_user_id: 'user-id',
      }),
    );
    const allActions = store.getActions();

    expect(allActions[0].type).toEqual('TOAST_ADDED');
    expect(allActions[0].payload.heading).toEqual(
      'Uh oh. There was an error refreshing your scratch org on task “My Task”.',
    );
    expect(allActions[0].payload.details).toEqual('error msg');
    expect(allActions[0].payload.variant).toEqual('error');
    expect(allActions[1]).toEqual(action);
  });

  test('adds error message [no known task]', () => {
    const store = storeWithThunk({
      user: { id: 'user-id' },
      tasks: {},
    });
    const org = {
      id: 'org-id',
      task: 'task-id',
      owner: 'user-id',
    };
    const action = {
      type: 'SCRATCH_ORG_UPDATE',
      payload: org,
    };
    store.dispatch(
      actions.refreshError({
        model: org,
        message: 'error msg',
        originating_user_id: 'user-id',
      }),
    );
    const allActions = store.getActions();

    expect(allActions[0].type).toEqual('TOAST_ADDED');
    expect(allActions[0].payload.heading).toEqual(
      'Uh oh. There was an error refreshing your scratch org.',
    );
    expect(allActions[0].payload.details).toEqual('error msg');
    expect(allActions[0].payload.variant).toEqual('error');
    expect(allActions[1]).toEqual(action);
  });

  test('does not update if no full model', () => {
    const store = storeWithThunk({
      user: { id: 'user-id' },
      tasks: {},
    });
    const org = {
      id: 'org-id',
      task: 'task-id',
    };
    store.dispatch(
      actions.refreshError({
        model: org,
        message: 'error msg',
        originating_user_id: 'user-id',
      }),
    );
    const allActions = store.getActions();

    expect(allActions.map((action) => action.type)).toEqual([
      'TOAST_ADDED',
      'SCRATCH_ORG_REFRESH_REJECTED',
    ]);
  });
});
