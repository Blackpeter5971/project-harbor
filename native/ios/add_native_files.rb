# Adds the native Swift files to the generated Xcode project (run in CI).
require 'xcodeproj'
project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
target = project.targets.find { |t| t.name == 'App' }
group = project.main_group.find_subpath('App', true)
%w[UnityAdsPlugin.swift GameViewController.swift].each do |f|
  next if group.files.any? { |x| x.path == f }
  target.add_file_references([group.new_reference(f)])
end
project.save
