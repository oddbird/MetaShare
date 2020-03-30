FROM oddbirds/pyjs:v-0.1.0

ARG BUILD_ENV=development

# Env setup:
ENV PYTHONPATH /app
ENV DATABASE_URL postgres://metecho@postgres:5432/metecho
# A sample key, not to be used for realsies:
ENV DB_ENCRYPTION_KEY 'IfFzxkuTnuk-J-TnjisNz0wlBHmAILOnAzoG-NpMQNE='
ENV DJANGO_HASHID_SALT 'sample hashid salt'
ENV DJANGO_SECRET_KEY 'sample secret key'
ENV DJANGO_SETTINGS_MODULE config.settings.production

# Python server setup:
COPY ./compose/web/start-server.sh /start-server.sh
RUN chmod +x /start-server.sh

# Python requirements:
COPY ./requirements /requirements
RUN pip install --no-cache-dir -r requirements/prod.txt
RUN if [ "${BUILD_ENV}" = "development" ]; then pip install --no-cache-dir -r requirements/dev.txt; fi

# Install sfdx
RUN mkdir sfdx && wget -qO- https://developer.salesforce.com/media/salesforce-cli/sfdx-linux-amd64.tar.xz | tar xJ -C sfdx --strip-components 1 && ./sfdx/install && rm -rf sfdx

# JS client setup:
COPY ./package.json /app/package.json
COPY ./yarn.lock /app/yarn.lock

COPY . /app

# === Actually run things:
WORKDIR /app
RUN yarn install --check-files

# Avoid building prod assets in development
RUN if [ "${BUILD_ENV}" = "production" ] ; then yarn prod ; else mkdir -p dist/prod ; fi
RUN python manage.py collectstatic --noinput

CMD /start-server.sh
