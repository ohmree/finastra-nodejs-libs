<h1> 
NestJS OIDC Auth module
<img src="https://nestjs.com/img/logo-small.svg" height="20" alt="Nest Logo" />
</h1>

NestJS module to enable OAuth 2 & OIDC login to your application.\
It exposes following endpoints :

- login?redirect_url redirect_url will be used as the path to redirect to on success login
- login/callback
- logout
- user
- refresh-token: to request token refresh if the access token is expired. If the token is valid, returns `200`.

And also a `TokenGuard`

## Use it

`app.module.ts`

```typescript
import { OidcModule } from '@finastra/nestjs-oidc';

@Module({
  imports: [
    OidcModule.forRootAsync({
      useFactory: async (configService: ConfigService) => ({
        issuer: configService.get('OIDC_ISSUER'),
        clientMetadata: {
          client_id: configService.get('OIDC_CLIENT_ID'),
          client_secret: configService.get('OIDC_CLIENT_SECRET'),
        },
        authParams: {
          scope: configService.get('OIDC_SCOPE'),
        },
        origin: configService.get('ORIGIN'),
        // Optional properties
        defaultHttpOptions: {
          timeout: 20000,
        },
        externalIdps: {},
        userInfoCallback: async (userId, idpInfos) => {
          return {
            username: userId,
            customUserInfo: 'custom',
          };
        },
      }),
      inject: [ConfigService],
      imports: [ConfigModule],
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

> [clientMetadata](https://github.com/panva/node-openid-client/blob/master/docs/README.md#new-clientmetadata-jwks-options) and [authParams](https://github.com/panva/node-openid-client/blob/master/docs/README.md#clientauthorizationurlparameters) are coming from the openid-client library. \
> [defaultHttpOptions](https://github.com/panva/node-openid-client/blob/master/docs/README.md#customizing-http-requests) can be used to customize all options that openid-client sets for all requests. \
> `externalIdps` is an object where keys are a label for the IDP and the value format is described [here](src\interfaces\oidc-module-options.interface.ts). \
> During authentication, the application will authenticate to those identity providers and the identity providers information are then forwarded in `userInfoCallback`. So that, you're able to call any API with a valid token. \
> `userInfoCallback` can be used to customize user information returned in user object on authentication. \
> `postLogoutRedirectUri` is used to specify custom endpoint to redirect to after logout (default is `/login`). \
> `userInfoMapping` can be used to map different claims to user id and and user name (defaults mappings are [here](src\utils\user-info.ts)).

### Example with externalIdps

In this example, I want to authenticate to an external IDP to be able to request an API to get my user groups. \
Here is the sample of config to add:

```typescript
{
  externalIdps: {
    azure: {
      clientId: configService.get('OIDC_AAD_CLIENT_ID'),
      clientSecret: configService.get('OIDC_AAD_CLIENT_SECRET'),
      issuer: configService.get('OIDC_AAD_ISSUER'),
      scope: configService.get('OIDC_SCOPE'),
    },
  },
  userInfoCallback: async (userId, idpInfos) => {
    const accessToken = idpInfos['azure'].accessToken;
    const groups = (
      await axios.request({
        method: 'get',
        url: `URL/${userId}/memberOf`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      })
    ).data.value.map(group => group.id);
    return {
      id: userId,
      groups,
    };
  },
}
```

`main.ts`

```typescript
import { setupSession } from '@finastra/nestjs-oidc';

setupSession(app, 'name-of-cookie');
```

> By default, session secret will be looked for in the `SESSION_SECRET` environment variable. If not provided, a uuid will be generated instead

### Auth Guards

Only one guard is exposed. \
You can either use it globally, or scoped per controller or route.

#### Globally

`main.ts`

```typescript
app.useGlobalGuards(app.get(TokenGuard));
```

Using the token guard globally will protect all your routes.

If you want to **redirect all the unauthorized requests to the login route**, you need to add this middleware in your project:

```typescript
import { SESSION_STATE_COOKIE } from '@finastra/nestjs-oidc';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Response } from 'express';

@Injectable()
export class StaticMiddleware implements NestMiddleware {
  use(req: any, res: Response, next: Function) {
    // If the request is authenticated, do nothing
    if (req.isAuthenticated()) {
      return next();
    }

    // Add the SESSION_STATE_COOKIE to make sure to prompt the login page if the user has already authenticated before
    res.cookie(SESSION_STATE_COOKIE, 'logging in', {
      maxAge: 15 * 1000 * 60,
    });

    // If you want to send the query params to the login middleware
    const searchParams = new URLSearchParams(req.query);

    // If you're using the multitenancy authentication, you'll need to get the prefix
    const channelType = req.params.channelType;
    const tenantId = req.params.tenantId;
    const prefix = `${tenantId}/${channelType}`;

    // Redirect to login page and forward the request query params
    res.redirect(`/${prefix}/login?${searchParams.toString()}`);
  }
}
```

#### Controller or route based

`*.controller.ts`

```typescript
import { TokenGuard } from '@finastra/nestjs-oidc';

@UseGuards(TokenGuard)
@Controller('')
```

### Popup login

Per default the login middleware will use the request header `sec-fetch-dest` value to know if the login should be done it a popup or not. If the value is set to `iframe` this will cause most browsers to show a popup to enter credentials on unauthorized responses. After login success it close the popup and redirect the page initiator as for a normal login flow.

## Other options to register OidcModule

| Option            | Description                                                             |
| ----------------- | ----------------------------------------------------------------------- |
| redirectUriLogout | Where to redirect user after logout. If not specified, `origin` is used |
| usePKCE           | Boolean to user or not [PKCE](https://oauth.net/2/pkce/)                |
| userInfoMethod    | `token` or `endpoint`. Default being `token`                            |

## Authenticating with multi-tenancy

### Pre-requisites

Before you begin, this multi-tenancy implementation is only compatible with FFDC tenants.
Make sure you've configured your applications and tenants in [Finastra developer portal](https://developer.fusionfabric.cloud/) and Finastra Organization Admin portal.

### Exposed endpoints

The exposed endpoints are the same but they will be prefixed by tenantId and channelType (`/:tenantId/:channelType/`):

- login
- login/callback
- logout
- user
- refresh-token

The `TokenGuard` is available and works the same as in single tenancy.

If your application handles single and multi tenancy, you can use `@isAvailableRouteForMultitenant` decorator with a boolean parameter on classes or functions.

### Usage

`app.module.ts`

```typescript
import { OidcModule } from '@finastra/nestjs-oidc';

@Module({
  imports: [
    OidcModule.forRootAsync({
      useFactory: async (configService: ConfigService) => ({
        issuerOrigin: configService.get('OIDC_ISSUER_ORIGIN'),
        b2c: {
          clientMetadata: {
            client_id: configService.get('OIDC_CLIENT_ID_B2C'),
            client_secret: configService.get('OIDC_CLIENT_SECRET_B2C'),
          },
        },
        b2e: {
          clientMetadata: {
            client_id: configService.get('OIDC_CLIENT_ID_B2E'),
            client_secret: configService.get('OIDC_CLIENT_SECRET_B2E'),
          },
        },
        authParams: {
          scope: configService.get('OIDC_SCOPE'),
        },
        origin: configService.get('ORIGIN'),
        // Optional properties
        defaultHttpOptions: {
          timeout: 20000,
        },
        userInfoCallback: async (userId, idpInfos) => {
          return {
            username: userId,
            customUserInfo: 'custom',
          };
        },
      }),
      inject: [ConfigService],
      imports: [ConfigModule],
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

> `issuerOrigin` is the route url of the IDP issuer. Issuer will be built with this pattern: `:issuerOrigin/:tenantId/.well-known/openid-configuration`
> The other parameters remains the same that on single tenancy except that `clientMetadata` need to be embedded in channel type `b2c` or `b2e` parameter.

## Utils

### Setup Session

If you don't want to have to think about how to configure the session, you can use our helpers. We currently expose 2: in-memory and mongoDB.\
The configuration for those can be found [here](./src/utils/session/).

#### In Memory

> This will not work if you're deploying multiple instances of your application.

```ts
import { sessionInMemory } from '@finastra/nestjs-oidc/utils/session';

sessionInMemory(app, 'test-app');

// Alternative way
import { setupSession } from '@finastra/nestjs-oidc';

setupSession(app, 'test-app');
```

#### MongoDB

> Preferred method if you're deploying multiple instances of your application.

```ts
import { sessionMongo } from '@finastra/nestjs-oidc/utils/session';

// Use mongoDB as session store
sessionMongo(app, 'test-app', {
  mongoUrl: 'mongodb://user:password@localhost:27017',
  dbName: 'sample-db',
});
```

> Third parameter is directly being passed to [connect-mongo](https://github.com/jdesboeufs/connect-mongo#options). Refer to its documentation for more information.
