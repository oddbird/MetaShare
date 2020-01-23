import Button from '@salesforce/design-system-react/components/button';
import Icon from '@salesforce/design-system-react/components/icon';
import WelcomeMatTile from '@salesforce/design-system-react/components/welcome-mat/tile';
import { Location } from 'history';
import i18n from 'i18next';
import React, { ReactElement } from 'react';
import { useSelector } from 'react-redux';
import { StaticContext, withRouter } from 'react-router';
import { Redirect, RouteComponentProps } from 'react-router-dom';

import { selectUserState } from '@/store/user/selectors';
import { addUrlParams } from '@/utils/api';
import routes from '@/utils/routes';
import welcomeMatBG from '#/welcome-mat-bg.png';

interface Props
  extends RouteComponentProps<{}, StaticContext, { from?: Location }> {
  id?: string;
  label?: string | ReactElement;
  from?: { pathname?: string };
}

export const LoginButton = withRouter(
  ({ id = 'login', label, from = {}, location }: Props) => {
    const handleClick = () => {
      /* istanbul ignore else */
      if (window.api_urls.github_login) {
        let { pathname } = (location.state && location.state.from) || from;
        if (!pathname) {
          pathname = window.location.pathname;
        }
        window.location.assign(
          addUrlParams(window.api_urls.github_login(), {
            next: pathname,
          }),
        );
      }
    };

    return (
      <Button
        id={id}
        label={label === undefined ? i18n.t('Log In With GitHub') : label}
        variant="brand"
        disabled={!window.api_urls.github_login}
        onClick={handleClick}
      />
    );
  },
);

const Login = () => {
  const user = useSelector(selectUserState);

  return user ? (
    <Redirect to={routes.home()} />
  ) : (
    <div
      className="slds-welcome-mat
        slds-welcome-mat_info-only
        welcome-container"
    >
      <div className="slds-welcome-mat__content slds-grid welcome-inner">
        <div
          className="slds-welcome-mat__info
            slds-size_1-of-1
            slds-medium-size_1-of-2"
          style={{ backgroundImage: `url(${welcomeMatBG})` }}
        >
          <div className="slds-welcome-mat__info-content">
            <h2 className="slds-welcome-mat__info-title">
              {i18n.t('Welcome to MetaShare!')}
            </h2>
            <div
              className="slds-welcome-mat__info-description
                slds-text-longform"
            >
              <p>
                {i18n.t(
                  'Welcome to MetaShare, the web-based tool for collaborating on Salesforce projects.',
                )}
              </p>
            </div>
            <div className="slds-welcome-mat__info-actions">
              <LoginButton />
            </div>
          </div>
        </div>
        <div
          className="slds-welcome-mat__tiles
            slds-size_1-of-1
            slds-medium-size_1-of-2
            slds-welcome-mat__tiles_info-only
            slds-grid
            slds-grid_vertical
            slds-p-left_xx-large
            slds-p-right_xx-large
            welcome-tile"
        >
          <WelcomeMatTile
            title={i18n.t('Welcome to MetaShare!')}
            description="Lorem ipsum dolor sit amet, lorem ipsum dolor sit amet."
            icon={<Icon category="utility" name="animal_and_nature" />}
            variant="info-only"
          />
          <WelcomeMatTile
            title="What can you do with MetaShare"
            description="Lorem ipsum dolor sit amet, lorem ipsum dolor sit amet. Making one just a little longer to test lengths. Lorem ipsum dolor sit amet, lorem ipsum dolor sit amet. Chocolate bar marzipan soufflé marshmallow sugar plum tiramisu."
            icon={<Icon category="utility" name="call" />}
            variant="info-only"
          />
          <WelcomeMatTile
            title="Who can use do with MetaShare"
            description="Lorem ipsum dolor sit amet, lorem ipsum dolor sit amet. Gummi bears bear claw lemon drops tootsie roll danish ice cream sugar macaroon chocolate cookie sweet ice cream caramels. biscuit lollipop marshmallow chocolate chocolate bar biscuit."
            icon={<Icon category="utility" name="upload" />}
            variant="info-only"
          />
          <WelcomeMatTile
            title="Where you can use MetaShare"
            description="Lorem ipsum dolor, a shorter one. Gummi bears bear claw lemon drops tootsie roll danish ice cream sugar biscuit lollipop marshmallow."
            icon={<Icon category="utility" name="magicwand" />}
            variant="info-only"
          />
          <WelcomeMatTile
            title="How to use MetaShare to its fullest potential"
            description="Lorem ipsum dolor sit amet, lorem ipsum dolor sit amet and a slightly longer one that may wrap in some cases. Soufflé donut jelly beans sugar plum oat cake. muffin chocolate candy chocolate chocolate bar marzipan soufflé marshmallow sugar plum tiramisu. Cake powder licorice topping. halvah powder muffin biscuit."
            icon={<Icon category="utility" name="knowledge_base" />}
            variant="info-only"
          />
        </div>
      </div>
    </div>
  );
};

export default Login;
