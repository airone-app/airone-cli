USER_HOME=`echo ~`
PROJECT_HOME=$USER_HOME"/.airone/repository"
PROJECT_NAME="airone"

main() {
  if [[ -d $PROJECT_HOME ]]; then
    git clean -df
    git reset --hard HEAD
    git pull
  else
     git clone https://github.com/airone-app/airone-cli.git $PROJECT_HOME
  fi
  echo "\n---------------------------------------"
  echo "$PROJECT_NAME will be install to your /usr/local/bin/ directory"
  cd $PROJECT_HOME

  npm install
  npm run build
  npm link

  echo "\n\nCongratulation, $PROJECT_NAME has installed successfully!"
  $PROJECT_NAME
}

main