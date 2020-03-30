# Generated by Django 3.0.4 on 2020-03-13 18:42

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0060_merge_20200312_2242"),
    ]

    operations = [
        migrations.AlterField(
            model_name="project",
            name="status",
            field=models.CharField(
                choices=[
                    ("Planned", "Planned"),
                    ("In progress", "In progress"),
                    ("Review", "Review"),
                    ("Merged", "Merged"),
                ],
                default="Planned",
                max_length=20,
            ),
        ),
    ]